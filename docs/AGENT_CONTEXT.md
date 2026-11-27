# Agent Context — Event Ticketing Capstone

This file is the **central knowledge base** for any AI coding agent joining this project. It is the single source of truth for how the codebase is organized, how decisions were made, what is implemented vs planned, and how agents are expected to work.

**Status:** Branch `build-5` (HEAD == `origin/main` == `main`). Node v24.19.0. All **198 tests pass** (`npm test`). Builds 1–4 are implemented. Build 5 (SQLite + overselling fix) is **planned only** — its spec exists in `docs/build-5.md` but the code is not written yet.

Do not modify application code based on this document alone. Read the referenced files, run the tests, and record new decisions here before assuming anything new is true.

---

## 1. Agent Working Principles

### Expected behavior
- You are a **cautious implementer**, not a code generator. Read first, run second, change third.
- Every change must be traceable to a requirement in `README.md`, `docs/user-stories.md`, a `docs/build-N.md`, or an explicit test. If no requirement exists, ask before building.
- Do not invent missing implementations and do not claim incomplete features work. Mark them `PLANNED` in section 8.
- Preserve existing architectural decisions unless there is a justified, documented reason to change them (and record the change in section 5 / this file).

### Coding standards (follow the existing code exactly)
- **ES modules**, `"type": "module"` in `package.json`. Use `import`/`export`, not `require`.
- **No external dependencies.** `package.json` has zero `dependencies` and zero `devDependencies`. Only Node built-ins (`node:http`, `node:fs`, `node:path`, `node:crypto`, `node:test`, `node:assert/strict`, etc.).
- **Node >= 22.13** (`.nvmrc`, `package.json` engines). Current runtime: v24.19.0.
- **Money:** whole numbers of the smallest unit (kobo/cents), never decimals. Fields named `priceCents`, `totalCents`, `maxPriceCents`. See `README.md` "Rules of the road".
- **Error style:** business problems → `DomainError` with a code from `src/domain/errors.js` (`ErrorCode`). Web problems → `HttpError` from `src/http/httpErrors.js`. Never let a stack trace reach the client.
- **Validation:** every input validated before any mutation. `src/domain/validation.js` is the single source of truth for `requireText`, `requireInteger`, `requireIsoDate`. Do not duplicate these helpers.
- **Naming:** lowercase booking states (`pending`, `paid`, `cancelled`, `refunded`, `checked_in`) from `BookingState` in `src/domain/bookingStateMachine.js`. Old vocabulary (`CONFIRMED`) is rejected — see `test/bookingStateMachine.test.js`.
- **Formatting:** 2-space indent, single quotes, semicolons, trailing commas where multi-line. Match the surrounding file.

### Decision-making principles
- **Layers never call upward.** `src/domain` never imports `src/http`. `src/http` never imports `src/domain/inventory.js` (business rules live in services). Enforced by `test/static.test.js` concepts and checked by `scripts/verify-build-3.js`.
- **Handlers return `{ status?, body? }`, they never write to the response.** `src/http/app.js` writes the response and converts errors.
- **Pure domain rules.** Functions in `src/domain/` have no I/O, no HTTP, no clock of their own, and return new arrays (never mutate inputs). See `src/domain/eventSearch.js`, `src/domain/sorting.js`.
- **Fail fast, fail whole.** Validate everything before mutating. A failed booking/payment must not leave partial state (`src/domain/inventory.js` "Validate first, mutate; nothing below can throw").
- **Idempotency where it matters.** Payments for the same booking reference are serialized with `paymentChains` so a card is charged at most once (`src/services/bookingService.js`).

### Implementation workflow
1. Read the relevant `docs/build-N.md` story and acceptance criteria.
2. Read the existing files you will touch (see section 10 "must-read files").
3. Write or update tests first (or alongside) in `test/`.
4. Implement the smallest change that satisfies the criteria.
5. Run `npm test` (all tests must pass) and `npm run coverage` if available.
6. Run `npm run demo` and/or `npm run benchmark` if you touched domain/demo code.
7. Add an entry to `docs/ai-log.md` for anything the AI (or you) got wrong and how it was fixed.
8. Commit on a `build-N` branch, open a PR into `main`, do not push straight to `main` (per `README.md`).

### Testing discipline
- Test framework: Node's built-in `node:test` + `node:assert/strict`. Script: `"test": "node --test \"test/**/*.test.js\""`.
- Only `*.test.js` files run (see `test/helpers.js` note in `docs/ai-log.md` AI-B2-05).
- One test per acceptance criterion, plus edge cases (empty list, impossible dates, duplicate transitions, unknown references, lowercase references).
- Tests must be deterministic and not depend on shared mutable state between test files. Use the fixtures in `test/apiHelpers.js` (each creates fresh API resources via real HTTP).
- **Never** change a test to make your code pass. Change the code, or re-examine the requirement.

### Rules against unnecessary refactoring
- **Do not refactor for aesthetics.** If it works, is tested, and follows the layering rules, leave it.
- Refactor only when: (a) a new feature cannot be added cleanly without it, (b) there is duplicated logic that the codebase already flags (e.g. the `validation.js` extraction in AI-B4-05), or (c) a bug requires it.
- Every refactor must keep all 198 tests passing and must be recorded in `docs/ai-log.md`.
- Do not add libraries, frameworks, or build tools. The project deliberately has zero dependencies.


---

## 2. Technical Infrastructure

### Runtime & package
- File: `package.json` — `"name": "dsa-project"`, `"type": "module"`, `"engines": { "node": ">=22.13" }`, private.
- Node version in use: v24.19.0.
- Zero dependencies (no npm packages). `node_modules/` and `data/` are gitignored (`.gitignore`).
- Scripts (all in `package.json`):
  - `npm start` → `node src/server.js` (starts HTTP server on `PORT`, default 3000)
  - `npm test` → `node --test "test/**/*.test.js"` (built-in runner, all tests)
  - `npm run coverage` → `node --test --experimental-test-coverage`
  - `npm run demo` → `node scripts/demo.js` (runs the Build 1 domain story in the terminal)
  - `npm run benchmark` → `node scripts/benchmark-lookup.js` (Map.get vs Array.find Big O demo)

### Entry point & config
- `src/server.js` — loads config, creates the in-memory repository, event service, booking service, builds the app via `createApp`, registers API routes, listens, handles graceful shutdown (SIGINT/SIGTERM, 10s grace).
- `src/config.js` — `loadConfig(env)` returns an `Object.freeze`d config: `port` (from `PORT`, default 3000, validated whole 0–65535), `publicDir` (resolved to `project/public`), `maxBodyBytes` (1 MB). `parsePort` rejects non-whole ports.
- `src/http/app.js` — `createApp({ publicDir, registerRoutes, logger, maxBodyBytes })`. Builds `node:http` server. Registers `/health`, runs `registerRoutes(router)`, serves static files from `public/` for non-API GET/HEAD. Single error door (`toErrorResponse`). Body size limit enforced. HEAD supported. Does not listen (server.js does).

### Database / data layer (current state)
- **In-memory only.** `src/repositories/memory.js` — `createMemoryRepository()` returns an `Object.freeze`d object of async methods backed by three `Map`s: `events`, `tiers`, `bookings`.
- Methods: `createEvent`, `getEvent`, `updateEvent`, `listEvents({publishedOnly})`, `createTier`, `getTier`, `listTiers`, `updateTier`, `createBooking`, `getBooking`, `updateBooking`, `peekWaitlist`.
- `createBooking` increments `tier.sold`; `createTier` seeds `waitlist: { entries: [] }`.
- **SQLite is NOT yet implemented.** Build 5 plans `src/db/schema.sql`, `src/db/connection.js` (node:sqlite), `src/repositories/sqlite.js`, `scripts/seed.js`, and a `seed` script. See `docs/build-5.md`. This is the immediate next build, not current code.
- Seats left are **always derived** as `capacity - sold`, never stored (architecture doc section 2).

### Application infrastructure
- HTTP server: raw `node:http` (no Express/Fastify). Custom router in `src/http/router.js`.
- Router: method + path with `:params`, trailing-slash tolerant, specific-before-parameter registration, duplicate-route rejection at registration, `HEAD` answered by `GET`, malformed %-escapes → not_found (never a crash).
- Static file serving: `src/http/static.js` — path-traversal safe (decodes once, refuses null bytes/backslashes/hidden names/`.`, resolves realpath and checks it stays inside `public/`), serves `index.html` for directories, correct MIME types, HEAD support.
- Authentication (temporary, Build 4): `src/lib/auth.js` — `authenticate(req)` reads `x-user-id` header, sets `req.user = { id }`; `assertOwnership(resource, userId)` throws `INVALID_TRANSITION` if mismatched. Real login/roles arrive in Build 7 (story S01).
- Mock payments: `src/lib/mockPaymentGateway.js` — `async charge(amountCents, { shouldDecline })` returns `{ ok: true }` or `{ ok: false, declineCode }`. No card numbers ever seen.
- Frontend (Build 6): `public/index.html` (event discovery), `public/event.html` (tiers/booking), `public/checkout.html` (countdown + mock pay), `public/css/styles.css`, `public/js/ui.js` (`el` helper + `formatCurrency`), `public/js/api.js` (single data-access layer, mock-backed, swap-able to real fetch), `public/js/pages/{home,event,checkout}.js`, `public/js/mockData.js`. `public/app.js` kept as a standalone health-check utility. No CSS framework, no bundler. All data access goes through `api.js`; pages never call `fetch` directly.

### Environment variables
- `PORT` — server port (default 3000). Example: `PORT=3001 npm start`.

---

## 3. Project Architecture

### Folder structure (actual files on disk)

```
DSA-PROJECT/
├── README.md                      # Course overview, stack, rules of the road
├── package.json                   # scripts, engines, type: module, zero deps
├── .nvmrc                         # empty (Node version pin placeholder)
├── .gitignore                     # node_modules, data, *.db, .env, .DS_Store, coverage
├── public/                        # static frontend (served by src/http/static.js)
│   ├── index.html                 # shell page, polls /health
│   └── app.js                     # vanilla module, fetch /health
├── scripts/                       # one-off/dev scripts (not part of the server)
│   ├── demo.js                    # Build 1 domain story (terminal)
│   ├── benchmark-lookup.js        # Map.get vs Array.find Big O
│   ├── try.js                     # scratch: create/publish one event
│   └── verify-build-3.js          # reviewer-style PASS/FAIL verification script
├── src/                           # application source
│   ├── server.js                  # composition root: config, repo, services, app, listen
│   ├── config.js                  # loadConfig, parsePort, DEFAULT_PORT
│   ├── domain/                    # RULES (pure, no I/O, no HTTP)
│   │   ├── errors.js              # ErrorCode + DomainError (business problems)
│   │   ├── validation.js          # requireText, requireInteger, requireIsoDate (single source)
│   │   ├── dates.js               # parseRealDate, isDateOnly (real-date validation, rejects 30 Feb)
│   │   ├── ids.js                 # newId (UUID v4), newReference (K7QM-3XPD), normalizeReference
│   │   ├── bookingStateMachine.js # BookingState, TRANSITIONS, canTransition, assertTransition
│   │   ├── inventory.js           # createStore + createEvent/addTier/bookTickets/cancelBooking/joinWaitlist/publish/unpublish/getEvent/getTier/findBookingByReference + views
│   │   ├── eventSearch.js         # filterEvents, sortEvents, searchEvents (pure, new arrays)
│   │   ├── sorting.js             # mergeSort (stable, new array, no Array.prototype.sort)
│   │   └── waitlistQueue.js       # Queue class (singly linked list, private fields, O(1))
│   ├── http/                      # ROUTES (HTTP in/out, no business rules)
│   │   ├── app.js                 # createApp, request pipeline, single error door
│   │   ├── router.js              # createRouter (method + :params)
│   │   ├── static.js              # createStaticServer (path-safe file serving)
│   │   ├── httpErrors.js          # HttpError, HttpCode, HTTP_STATUS, DOMAIN_STATUS, toErrorResponse
│   │   └── apiRoutes.js           # registerApiRoutes (all /api/* routes, Build 4)
│   ├── services/                  # SERVICES (use cases, orchestrate domain + repository)
│   │   ├── eventService.js        # createEvent, addTier, publishEvent, unpublishEvent, searchEvents
│   │   └── bookingService.js      # bookTickets, payBooking, cancelBooking (payment idempotency chains)
│   ├── repositories/              # DATA (storage, swappable)
│   │   └── memory.js              # createMemoryRepository (Map-backed, async methods)
│   └── lib/                       # cross-cutting helpers
│       ├── auth.js                # authenticate, assertOwnership (x-user-id stand-in auth)
│       └── mockPaymentGateway.js  # charge (async mock)
└── test/                          # Node node:test suite (198 tests, 42 suites, all pass)
    ├── api.test.js                # Build 4 API tests via real HTTP test server
    ├── apiHelpers.js              # startTestServer + seed fixtures (seedEvent, seedTier, ...)
    ├── app.test.js                # /health, error shape, static-file path-traversal attacks
    ├── bookingStateMachine.test.js# every allowed/illegal move, final states, bad input
    ├── cancelBooking.test.js      # cancel, seats released once, waitlist next-in-line
    ├── config.test.js             # PORT parsing, loadConfig
    ├── eventSearch.test.js        # S05 filter/sort/search, immutability, edge cases
    ├── helpers.js                 # errorOf, newEvent, newEventWithTier, row
    ├── httpErrors.test.js         # status tables, toErrorResponse, no leak
    ├── inventory.test.js          # S02/S03/S04/S06 domain tests
    ├── router.test.js             # route matching, params, registration errors
    ├── sorting.test.js            # mergeSort correctness, stability, no Array.sort
    └── static.test.js             # safeSegments path safety
```


### Architectural layers (from `docs/architecture.md`, section 1)

Calls only go **downward**. Nothing in a lower layer imports from a higher one.

| Layer | Location | Responsibility | May | May not |
|---|---|---|---|---|
| Routes | `src/http/` (router, app, apiRoutes, httpErrors) | Read HTTP request, call one service, turn result/error into JSON response | parse request, call service, format response | contain business rules, touch data directly |
| Services | `src/services/` (eventService, bookingService) | Run one use case start-to-finish (e.g. "book tickets"); ask rules what is allowed, data layer to load/save | orchestrate, validate input via domain helpers | know about HTTP |
| Rules | `src/domain/` (validation, dates, ids, bookingStateMachine, inventory, eventSearch, sorting, waitlistQueue) | Pure functions + plain data; no I/O, no HTTP, no clock/db | compute, validate, decide | perform I/O |
| Data | `src/repositories/memory.js` | Store and load records (Map today, SQLite planned Build 5) | persist, query | make business decisions beyond consistency |

### Data flow (one request)
1. `src/server.js` starts server on `PORT`.
2. Client sends HTTP request.
3. `src/http/app.js` `handle()`: parses URL (`parseRequestUrl`), matches route via router.
4. For POST/PUT/PATCH: reads and validates JSON body (`readJsonBody`, enforced `maxBodyBytes`).
5. Route handler runs: calls `authenticate` (sets `req.user`), calls a service method.
6. Service calls domain rules + repository; returns result or throws `DomainError`.
7. Handler returns `{ status?, body? }` or throws.
8. `app.js` sends JSON via `sendJson`; errors go through `toErrorResponse` → `{"error":{"code","message"}}`. Stack traces and secrets never reach the client.
9. If no route fits: `/api` paths → JSON 404; other GET/HEAD → static file from `public/`.


### Data model (from `docs/architecture.md`, section 2)
- `EVENT` ||--o{ `TICKET_TIER` (has); `TICKET_TIER` ||--o{ `BOOKING` (is booked from); `TICKET_TIER` ||--o{ `WAITLIST_ENTRY` (queues); `USER` ||..o{ `BOOKING` (will own, Build 7).
- `USER` does **not** exist in code yet (arrives Build 7). Until then, `x-user-id` header is a stand-in and bookings carry `userId`.
- Fields: event (`id`, `title`, `city`, `venue`, `startsAt` ISO, `status` DRAFT/PUBLISHED, `tierIds`); tier (`id`, `eventId`, `name`, `priceCents` whole kobo, `capacity`, `sold`, `waitlist`); booking (`id`, `reference` e.g. `K7QM-3XPD`, `eventId`, `tierId`, `customerName`→`userId` Build 7, `quantity` 1–10, `totalCents`, `status`, `createdAt`, `cancelledAt`); waitlist entry (`id`, `name`, `quantity`, `joinedAt`).

### Booking life cycle (from `docs/architecture.md`, section 3)
```
[*] --> pending (book tickets)
pending --> paid (pay)
pending --> cancelled (cancel or expire)
paid --> checked_in (scanned at door)
paid --> refunded (cancel inside refund window)
paid --> cancelled (cancel outside refund window)
checked_in --> [*]
refunded --> [*]
cancelled --> [*]
```
Allowed moves (enforced by `assertTransition`):
- `pending → paid`, `pending → cancelled`
- `paid → checked_in`, `paid → refunded`, `paid → cancelled`
- `cancelled`, `refunded`, `checked_in` are **final** (nothing leaves them)
- Any other move (including staying put) → `INVALID_TRANSITION`

### Error code → HTTP status mapping (`src/http/httpErrors.js`)
- `VALIDATION`→400, `NOT_FOUND`→404, `SOLD_OUT`→409, `CONFLICT`→409, `INVALID_STATE`→409, `INVALID_TRANSITION`→409, `PAYMENT_DECLINED`→402 (domain)
- `BAD_REQUEST`→400, `BAD_JSON`→400, `NOT_FOUND`→404, `METHOD_NOT_ALLOWED`→405, `PAYLOAD_TOO_LARGE`→413, `INTERNAL`→500 (HTTP)
- A test (`test/httpErrors.test.js`) fails if any domain code or HTTP code is added without a status mapping.


---

## 4. Core System Knowledge

### Domain models

**Event** (created via `inventory.createEvent` / `eventService.createEvent`): starts as `DRAFT`, not public. Needs ≥1 tier before `publishEvent` (else `INVALID_STATE`). `unpublishEvent` returns to draft. Search/list only returns `PUBLISHED` events unless `publishedOnly: false`.

**Ticket Tier** (`addTier` / `eventService.addTier`): `name` (unique per event, case-insensitive clash → `CONFLICT`), `priceCents` (≥0 whole), `capacity` (≥1), `sold` (starts 0), `waitlist` (Queue). Duplicate tier name rejected.

**Booking** (`bookTickets` / `bookingService.bookTickets`): `quantity` 1–10 (`VALIDATION` outside), tier must exist (`NOT_FOUND`), event must be `PUBLISHED` (`INVALID_STATE` if draft — enforced in service), enough seats (`SOLD_OUT` if not, nothing changes). `totalCents = priceCents * quantity`. Status starts `pending`. Reference generated (up to 10 attempts for uniqueness, `CONFLICT` if exhausted). `customerName` validated. Booking holds seats immediately (`tier.sold += quantity`).

**Payment** (`payBooking`): only `pending → paid` allowed. Ownership checked (`assertOwnership`). Mock `charge()` called once per in-flight reference (`paymentChains` Map serializes concurrent pays → card charged at most once). Declined → `PAYMENT_DECLINED` (402), booking stays `pending`, can retry. Already paid → `INVALID_TRANSITION`.

**Cancellation** (`cancelBooking`): Build 4 allows only `pending` bookings (`booking.status !== PENDING` → `INVALID_TRANSITION`). Releases seats (`tier.sold -= quantity`), sets `cancelledAt`, returns `seatsAvailable` and `nextInLine` (waitlist peek). Cancelling twice → `INVALID_TRANSITION`, seats released only once. `refunded`/`checked_in` cannot be cancelled.

**Waitlist** (`joinWaitlist` / `inventory.joinWaitlist`): only when `count > available` (else `CONFLICT` — book directly). FIFO linked-list `Queue`. Returns position. On cancel, `nextInLine` is the waitlist head.

**Search** (`searchEvents`): filter then sort, both return new arrays (original untouched). Criteria: `q` (title/venue, case-insensitive substring), `city` (exact, case-insensitive), `from`/`to` (inclusive; date-only `to` = whole day UTC), `maxPriceCents` (whole ≥0; events with no tiers excluded from price filters), `onlyAvailable` (seatsAvailable > 0). Sort by `date`/`price`/`availability`, ties by title then id. Unknown `sortBy` → `VALIDATION`. Bad date/price → `VALIDATION`.


### Business rules & critical workflows

1. **Overselling prevention (planned, Build 5):** Currently the in-memory `bookTickets` checks `available` then mutates — race-unsafe under concurrency (no lock/transaction yet, per Build 4 rules: "Do not add locks or transactions yet"). Build 5 will fix this in the database with atomic `UPDATE ... WHERE sold + ? <= capacity`. See `docs/build-5.md`. **Current in-memory code is NOT concurrency-safe.**
2. **Refunds:** Not yet implemented (Build 8, stories S09/S10). The state machine supports `paid → refunded`, but no refund policy/service exists.
3. **Waitlist seat offer:** Partially present — `joinWaitlist` and `nextInLine` on cancel exist, but the "offer freed seat for limited time, then pass to next" flow is Build 8 (S11/S12).
4. **Check-in / QR:** Not implemented (Build 9, S14/S15). State machine supports `paid → checked_in`.
5. **Login/roles:** Not implemented (Build 7, S01/S13). `x-user-id` is a stand-in.

### Services summary

`createEventService(repository)`:
- `createEvent({title, city, venue, startsAt})` → validates, stores DRAFT
- `addTier(eventId, {name, priceCents, capacity})` → clash check, `CONFLICT` on dup name
- `publishEvent(eventId)` → `INVALID_STATE` if already published or no tiers
- `unpublishEvent(eventId)` → `INVALID_STATE` if already draft
- `searchEvents(criteria, sortBy)` → published events only, filter + sort

`createBookingService(repository, { charge })`:
- `bookTickets({tierId, quantity, customerName, userId})` → published check, capacity check, reference uniqueness, `repository.createBooking`
- `payBooking(reference, userId, {shouldDecline})` → idempotency chain, ownership, state transition, mock charge, `repository.updateBooking` to `paid`
- `cancelBooking(reference, userId)` → ownership, `pending`-only check, release seats, `nextInLine`

### Error handling (critical)
- Every error leaves through `toErrorResponse` in `src/http/httpErrors.js` (single door).
- `DomainError` → mapped status via `DOMAIN_STATUS`; `details` are **not** sent to client.
- `HttpError` → its own status/code/headers.
- Anything unexpected → logged on server, client gets generic 500 `INTERNAL`, no stack, no secret.
- Tests assert no leak: `JSON.stringify(out)` must not include secrets or ` at ` (stack).


---

## 5. Engineering Decisions

### Design patterns in use
- **Layered architecture** (routes → services → rules → data), one-way dependency. Documented in `docs/architecture.md`.
- **Repository pattern / dependency injection:** services receive the repository as a constructor argument; they do not import it (`src/services/*.js`, `src/repositories/memory.js`). Makes the repo swappable (memory → SQLite in Build 5 without changing services).
- **Factory functions:** `createApp`, `createRouter`, `createMemoryRepository`, `createEventService`, `createBookingService`, `createStore` — all return `Object.freeze`d objects where appropriate.
- **State machine as data:** `BookingState` + `TRANSITIONS` map in `src/domain/bookingStateMachine.js`; `assertTransition` is the single gate for all status changes.
- **Single source of truth for validation:** `src/domain/validation.js` (extracted in AI-B4-05 to remove duplication between `inventory.js` and `eventService.js`).
- **Single error door:** `toErrorResponse`; `src/http/httpErrors.js` is the only file that calls `new HttpError(`.
- **Idempotency key:** `paymentChains` Map keyed by booking reference in `bookingService.js`.

### Key trade-offs & reasons
- **In-memory Map repository now, SQLite later (Build 5):** Keeps builds 1–4 simple and testable; `node:sqlite` is experimental in Node 22/24 but available. Services are written repo-agnostic so the swap is contained.
- **No locks/transactions in Build 4:** Deliberate per build-4 prompt ("Do not add locks or transactions yet"). Known limitation: concurrent `bookTickets` for the last seat can oversell in memory. Build 5 fixes at DB level with atomic conditional UPDATE.
- **`x-user-id` header as auth stand-in until Build 7:** `authenticate()` in `src/lib/auth.js` is the one place to change when real auth arrives; everything else uses `req.user.id`.
- **Money as whole cents/kobo, fields named `priceCents`:** A Build 1 decision kept for consistency even though the README says kobo/naira. Do not switch to decimals.
- **Date-only `to` filter = whole day in UTC:** Documented decision in `docs/ai-log.md` ("Decisions where we went silent").
- **No external packages, no build step:** Deliberate for the course; `npm test` uses Node's built-in runner.

### Known limitations (current code)
1. **Concurrency:** In-memory booking is not atomic — overselling possible under simultaneous requests (Build 5 addresses).
2. **No persistence:** Data lost on restart (Build 5 adds SQLite + seed).
3. **No auth beyond `x-user-id`:** No signup/login, no roles (Build 7).
4. **No refunds, no waitlist-offer flow, no expiry, no check-in/QR:** Builds 8–9.
5. **No `USER` table / `userId` foreign key enforcement yet:** bookings carry `userId` but there is no users repository.

### Decisions recorded in `docs/ai-log.md`
- Publish/unpublish a draft/already-published → `INVALID_STATE`.
- Book on a draft event: **not blocked** in Build 1 rules (S06 only describes published case); Build 4 service adds the published check.
- Impossible dates (30 Feb) rejected via `parseRealDate` (AI-B2-01).
- `INVALID_STATE` added to `ErrorCode` (AI-B2-02).
- Event shape changed to `title`/`city`/`venue` (AI-B2-03).
- New bookings start `pending`, not `confirmed` (AI-B2-04).
- Build 4 bugs fixed: `charge` wiring (`{ charge }` not bare fn), `assertTransition` import restored, cancel restricted to pending, reference normalization, collision check, repository `createTier` throws `NOT_FOUND` for missing event (AI-B4-06).
- `validation.js` extracted (AI-B4-05); booking/pay/cancel API tests added (AI-B4-07).


---

## 6. Development History

### Git branches & completed builds
- `build-1` — `ceddc82` "add major domain starter files": domain core (errors, ids, queue, inventory store), `scripts/demo.js`, `scripts/benchmark-lookup.js`.
- `build-2` — `b3571c9` "Build 2: event search, merge sort, publish/unpublish, tests": `sorting.js`, `eventSearch.js`, publish/unpublish/list summaries, first tests, `npm test` script.
- `build-3` — `a1b92db` "Build 3: booking state machine, HTTP server skeleton": `bookingStateMachine.js`, `docs/architecture.md` (3 Mermaid diagrams), `src/http/router.js`, `src/http/app.js`, `src/http/static.js`, `src/http/httpErrors.js`, `src/server.js`, `src/config.js`, `npm start` script, `/health`.
- `build-4` — `ecff805` "Build-4: REST API with services, in-memory repository and mock payments" (HEAD): `src/repositories/memory.js`, `src/services/eventService.js`, `src/services/bookingService.js`, `src/lib/auth.js`, `src/lib/mockPaymentGateway.js`, `src/http/apiRoutes.js`, all `/api/*` endpoints, `docs/api-examples.md`, API tests (`test/api.test.js`, `test/apiHelpers.js`).
- `main` == `origin/main` == `build-5` at `e6fbaa0` (merge of build-4 PR #4).

### Current project status
- **Build 4 complete and merged to `main`.** All 198 tests pass.
- `docs/build-5.md` exists (untracked) as the spec for the next build but **Build 5 code is not implemented** — no `src/db/`, no `src/repositories/sqlite.js`, no `scripts/seed.js`, no overselling fix/demo/test.
- Builds 6–9 exist only in `docs/milestones.md` (planned, not started).
- `docs/ai-log.md` has entries through Build 4.
- Branch `build-5` is checked out; working tree clean except untracked `docs/build-5.md`.

### Milestones table (`docs/milestones.md`)
| Build | Week | Milestone | Stories |
|---|---|---|---|
| 1 | 4 | Domain core in the terminal | — (groundwork) |
| 2 | 5 | Event search, sorting, backlog, first tests | S02, S03, S04, S05, S06, S16 |
| 3 | 6 | Architecture, state machine, server skeleton | — (groundwork) |
| 4 | 7 | Working REST API (in memory) | S02, S03, S04, S05, S06, S07 |
| 5 | 8 | SQLite and the overselling fix | S08 |
| 6 | 9 | Frontend on mock data | S05, S06, S07 |
| 7 | 10 | Login, roles and a connected app | S01, S13, S02, S03, S04 |
| 8 | 11 | Refunds, waitlist, expiry, real test suite | S09, S10, S11, S12 |
| 9 | 12 | QR check-in, CI, security, demo-ready | S14, S15, S16 |

### Problems encountered & solutions adopted
- **30 February accepted as valid** → `parseRealDate` rebuilds date from Y/M/D and round-trips to reject rollover (`src/domain/dates.js`).
- **`INVALID_STATE` missing from `ErrorCode`** → added; `DomainError` throws `TypeError` for unknown codes (AI-B2-02).
- **`CONFIRMED` vs `pending`** → new bookings start `pending`; confirmation only after payment (AI-B2-04).
- **`charge` passed as bare function → `charge.charge` undefined → 500 on payment** → pass `{ charge }` (AI-B4-06).
- **Missing `assertTransition` import** → restored (AI-B4-06).
- **Paid bookings cancellable** → added explicit `pending`-only check beyond state machine (AI-B4-06).
- **Lowercase references 404** → `normalizeReference()` in service lookups (AI-B4-06).
- **Reference collision / silent overwrite** → collision loop + `bookings.has()` guard (AI-B4-06).
- **Only event tests in `api.test.js`** → added 13 booking/pay/cancel tests (AI-B4-07).

- No `.env` file (gitignored). Never commit secrets (README rule).

---

## 7. Testing & Quality Assurance

### Test commands
- `npm test` — `node --test "test/**/*.test.js"` — the canonical command. Must be green (198 pass, 0 fail) before any commit.
- `npm run coverage` — `node --test --experimental-test-coverage`.
- `npm run demo` — domain story (Build 1). Run if you touched `src/domain/inventory.js` or `scripts/demo.js`.
- `npm run benchmark` — Map vs Array.find (informational).

### Testing strategy
- **Domain layer:** pure unit tests in `test/` using the in-memory `createStore()` directly (`inventory.test.js`, `cancelBooking.test.js`, `eventSearch.test.js`, `sorting.test.js`, `bookingStateMachine.test.js`). Fast, no server.
- **HTTP layer:** `test/app.test.js` starts `createApp` on a free port with a temp `publicDir`; covers `/health`, error shape, static-file path-traversal attacks (13 attack paths incl. double-encoding, null bytes, symlinks), content types, HEAD, 405.
- **API layer:** `test/api.test.js` starts the **real server** via `startTestServer()` (`test/apiHelpers.js`) on a free port and makes real HTTP requests. Each test seeds its own resources through the API (no shared state). Covers events, tiers, publish/unpublish, search, book, pay (success/decline/double/unknown/cancelled), cancel (pending/twice/paid/unknown).
- **Fixtures:** `test/apiHelpers.js` exports `startTestServer`, `authHeaders`, `seedEvent`, `seedTier`, `seedPublishedEvent`, `seedBooking`, `seedPaidBooking`, `seedCancelledBooking`.
- **Helper:** `test/helpers.js` exports `errorOf(fn)` (catches and returns the thrown error), `newEvent`, `newEventWithTier`, `row` (search/sort test row), re-exports `createStore`.
- **Assertion style:** `node:assert/strict` (`assert.equal`, `assert.deepEqual`, `assert.ok`, `assert.throws`, `assert.doesNotThrow`).

### Acceptance criteria (per story, from `docs/user-stories.md` definition of done)
1. The rule works and has at least one test, including an edge case.
2. It is reachable the way a user would reach it (API, and screen where it applies).
3. The AI log (`docs/ai-log.md`) has an entry for anything the AI got wrong.
4. It is merged through a pull request (branch `build-N`, PR into `main`).

### Regression requirements
- `npm test` must stay at 198 pass / 0 fail (or the count must rise only via legitimate new tests, never via deleted/weakened tests).
- Do not delete tests to make new code pass.
- Adding a new `ErrorCode` or `HttpCode` requires a matching status in `DOMAIN_STATUS`/`HTTP_STATUS` (tests enforce this).
- The "no layer calls upward" rules (domain never imports http; http never imports inventory) must remain true — checked conceptually by `scripts/verify-build-3.js`.

### Verification procedures
Before declaring a task done:
1. `npm test` — all pass.
2. Read the relevant `docs/build-N.md` acceptance criteria and confirm each is met.
3. Confirm no business rules leaked into `src/http/` and no HTTP imports in `src/domain/`.
4. Confirm money is whole cents, dates use `parseRealDate`, errors use `DomainError`/`HttpError` codes.
5. Add `docs/ai-log.md` entry for any wrong turn.
6. Commit on a `build-N` branch, open PR into `main`.


---

## 8. Current Roadmap

### Outstanding / planned (NOT implemented)
- **Build 5 — SQLite and the overselling fix (immediate next, week 8):** `src/db/schema.sql`, `src/db/connection.js` (node:sqlite), `src/repositories/sqlite.js` (same methods as `memory.js` so services don't change), parameterised queries only, `CHECK (sold >= 0 AND sold <= capacity)`, atomic overselling fix (`UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity`, use changed-rows count, `SOLD_OUT` if none), `scripts/seed.js` + `seed` script, `scripts/oversell-demo.js` (50 simultaneous bookings, 1 seat → exactly 1 success), `test/oversell.test.js`, data survives restart. Spec: `docs/build-5.md`. Story: S08.
- **Build 6 — Frontend on mock data:** screens for browse/search/book/pay. **IMPLEMENTED** (branch `build-6`): `public/index.html`, `public/event.html`, `public/checkout.html`, `public/css/styles.css`, `public/js/ui.js`, `public/js/mockData.js`, `public/js/api.js`, `public/js/pages/{home,event,checkout}.js`, `test/frontend/{api,ui}.test.js`. `public/app.js` kept as a standalone health-check utility. All 215 tests pass (200 backend + 15 frontend).
- **Build 7 — Login, roles and a connected app:** signup/login (`USER` table), organizer/attendee/staff roles, private bookings (S13), screens wired to real API.
- **Build 8 — Refunds, waitlist, expiry, real test suite:** refund policy (S09), unpaid booking expiry (S10), waitlist seat offer with timeout (S11/S12), CI.
- **Build 9 — QR check-in, CI, security, demo-ready:** QR scan at door (S14), forged/repeat scan rejection (S15), CI running `npm test` on push (S16).

### Known technical debt
1. In-memory repository not concurrency-safe (overselling under concurrent book) — addressed only by Build 5's SQLite atomic UPDATE.
2. No persistence (data lost on restart).
3. `x-user-id` stand-in auth (no real users/roles).
4. `docs/build-5.md` is untracked (not yet committed).
5. `scripts/try.js` and `scripts/verify-build-3.js` are scratch/verification scripts, not part of the test suite.

### Immediate priorities
1. Implement Build 5 (SQLite + overselling fix) per `docs/build-5.md`.
2. Commit `docs/build-5.md` and the Build 5 code on branch `build-5`, PR into `main`.
3. Keep `npm test` green throughout.


---

## 9. Agent Collaboration Protocol

When multiple agents work on this project:

### Share context
- **Always read `docs/AGENT_CONTEXT.md` first** before writing code. It is the authoritative summary.
- Read the specific `docs/build-N.md` for the build you are implementing, plus `docs/architecture.md` and `docs/ai-log.md`.
- Check `git status` and `git log --oneline` to know the current branch and what has been merged.
- Confirm `npm test` is green before you start and after you finish.

### Preserve existing decisions
- Do not overturn layering, error-shape, money-as-whole-cents, `x-user-id` stand-in, or the state-machine transitions without a documented reason recorded here and in `docs/ai-log.md`.
- Do not rename files/functions that tests import (e.g. `createMemoryRepository`, `createEventService`, `registerApiRoutes`, `toErrorResponse`, `BookingState`, `assertTransition`).

### Avoid conflicting implementations
- Work on one build at a time. Do not start Build 6 while Build 5 is in flight.
- If two agents touch the same file, the second agent must re-read the file after the first commits and re-run `npm test`.
- Prefer additive changes (new routes, new service methods) over changing existing signatures; if you must change a signature, update all call sites and tests.

### Communicate changes
- Every non-trivial change gets an entry in `docs/ai-log.md`: what you asked/did, what came back, what was wrong, what you changed, and proof (test/demo).
- Update this `docs/AGENT_CONTEXT.md` whenever: a new build is completed, a file is added/removed/renamed, a dependency is added (should not happen), a layer boundary changes, a decision is reversed, or technical debt is paid down.
- Commit on branch `build-N`, open PR into `main`, do not push straight to `main` (README rule).

### Maintain consistent code quality
- Match existing style: ES modules, 2-space indent, single quotes, `Object.freeze` for service/repo returns, `DomainError`/`HttpError` for errors, validation before mutation, no mutation of inputs.
- Run `npm test` (and `npm run demo`/`benchmark` if relevant) before considering a task complete.
- No external packages, no build tools, no `.env` commits.


---

## 10. Knowledge Preservation

### Files agents MUST read before coding
1. `README.md` — stack, rules of the road, three hard problems.
2. `docs/AGENT_CONTEXT.md` — this file.
3. `docs/architecture.md` — layering, data model, booking life cycle, error shape.
4. `docs/user-stories.md` — backlog, acceptance criteria, definition of done.
5. `docs/build-N.md` for the build you are implementing (e.g. `docs/build-5.md` for the next work).
6. `package.json` — scripts, engines, dependencies.
7. `src/http/httpErrors.js` — the one error file; `DOMAIN_STATUS` / `HTTP_STATUS` tables.
8. `src/domain/errors.js` + `src/domain/validation.js` — error codes and validation helpers.
9. `src/domain/bookingStateMachine.js` — allowed transitions.

### Documents that MUST be updated after implementation
- `docs/ai-log.md` — entry for every AI prompt / wrong turn / fix (course requirement, graded).
- `docs/AGENT_CONTEXT.md` — whenever a build completes, files change, a decision is recorded, or roadmap progress is made.
- `docs/build-N.md` — if you change acceptance criteria or discover a gap between spec and code.
- `docs/api-examples.md` — if you add or change any API endpoint.
- `docs/milestones.md` — only when a build is genuinely done and merged.

### How new discoveries and decisions are recorded
1. **Discovery** (e.g. "in-memory booking is race-unsafe") → write it in this file under the relevant section (limitations / roadmap / engineering decisions).
2. **Decision** (e.g. "use `UPDATE ... WHERE sold + ? <= capacity` for overselling") → record in `docs/ai-log.md` (what was wrong, the fix, proof) and summarize here in section 5.
3. **New file or dependency** → update section 3 (folder structure) and section 2 (infrastructure) here.
4. **Completed build** → update section 6 (development history), section 8 (roadmap), and mark the build DONE vs planned.

### Implemented vs planned — how to tell
- **Implemented:** code exists in `src/`, has tests in `test/`, `npm test` green. Examples: everything in Builds 1–4.
- **Partially implemented:** spec written but code incomplete (e.g. `docs/build-5.md` exists; `src/domain/inventory.js` has `joinWaitlist` but no waitlist-offer flow; state machine supports `refunded` but no refund service).
- **Planned:** only in `docs/milestones.md` / `docs/build-N.md`, no code. Examples: Builds 6–9, SQLite, login, refunds, QR check-in.

