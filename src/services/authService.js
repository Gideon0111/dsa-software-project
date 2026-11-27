import { DomainError, ErrorCode } from "../domain/errors.js";
import { hashPassword, verifyPassword, needsRehash } from "../lib/password.js";
import { signToken } from "../lib/token.js";
import { requireText } from "../domain/validation.js";

const VALID_ROLES = Object.freeze(["attendee", "organizer", "staff"]);
const MIN_PASSWORD_LENGTH = 8;

// Simple email validation: must contain exactly one @ and a dot in the domain part.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function validateEmail(email) {
  if (typeof email !== "string" || email.trim() === "") {
    throw new DomainError(
      ErrorCode.VALIDATION,
      "email: must be a non-empty string",
      { field: "email" }
    );
  }
  const normalized = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalized)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      "email: must be a valid email address",
      { field: "email" }
    );
  }
  return normalized;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `password: must be at least ${MIN_PASSWORD_LENGTH} characters`,
      { field: "password" }
    );
  }
}

function validateRole(role) {
  if (!VALID_ROLES.includes(role)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `role: must be one of ${VALID_ROLES.join(", ")}`,
      { field: "role" }
    );
  }
}

function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

export function createAuthService(repository) {
  /**
   * POST /api/auth/signup
   * Creates a new user account, hashes the password, and returns a signed token.
   */
  async function signup({ email, password, role }) {
    const normalizedEmail = validateEmail(email);
    validatePassword(password);
    validateRole(role);

    const existing = await repository.getUserByEmail(normalizedEmail);
    if (existing) {
      throw new DomainError(
        ErrorCode.EMAIL_TAKEN,
        `An account with email "${normalizedEmail}" already exists`,
        { email: normalizedEmail }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await repository.createUser({
      email: normalizedEmail,
      passwordHash,
      role,
    });

    const token = signToken({ userId: user.id, role: user.role });

    return {
      user: safeUser(user),
      token,
    };
  }

  /**
   * POST /api/auth/login
   * Verifies credentials and returns a signed token.
   * Unknown email and wrong password both produce the same INVALID_CREDENTIALS
   * error, so the caller cannot distinguish them by error message or timing.
   */
  async function login({ email, password }) {
    const normalizedEmail = validateEmail(email);

    const user = await repository.getUserByEmail(normalizedEmail);

    let passwordMatch = false;
    if (user) {
      passwordMatch = await verifyPassword(password, user.passwordHash);
    } else {
      await verifyPassword(password, "invalid-dummy-hash-for-timing");
    }

    if (!passwordMatch) {
      throw new DomainError(
        ErrorCode.INVALID_CREDENTIALS,
        "Invalid email or password"
      );
    }

    const token = signToken({ userId: user.id, role: user.role });

    const needsUpgrade = needsRehash(user.passwordHash);

    return {
      user: safeUser(user),
      token,
      needsRehash: needsUpgrade,
    };
  }

  async function me(userId) {
    const user = await repository.getUserById(userId);
    if (!user) {
      throw new DomainError(ErrorCode.NOT_FOUND, "User not found");
    }
    return safeUser(user);
  }

  return Object.freeze({ signup, login, me });
}