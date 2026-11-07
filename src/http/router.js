const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function compile(path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new TypeError(`Route path must be a string starting with "/": ${path}`);
  }
  if (/[?#]/.test(path)) throw new TypeError(`Route path must not contain "?" or "#": ${path}`);

  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed === "/" ? [] : trimmed.slice(1).split("/");
  const seen = new Set();

  return segments.map((segment) => {
    if (segment === "") throw new TypeError(`Route path has an empty segment: ${path}`);
    if (!segment.startsWith(":")) return { literal: segment };

    const name = segment.slice(1);
    if (!PARAM_NAME.test(name)) throw new TypeError(`Bad parameter name "${segment}" in ${path}`);
    if (seen.has(name)) throw new TypeError(`Parameter ":${name}" is used twice in ${path}`);
    seen.add(name);
    return { param: name };
  });
}

const shapeOf = (parts) => "/" + parts.map((p) => (p.param ? ":" : p.literal)).join("/");

function splitRequestPath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return null;
  const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (trimmed === "/") return [];
  try {
    return trimmed.slice(1).split("/").map((s) => decodeURIComponent(s));
  } catch {
    return null;  
  }
}

function matchParts(parts, segments) {
  if (parts.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const segment = segments[i];
    if (part.param) {
      if (segment === "") return null; 
      params[part.param] = segment;
    } else if (part.literal !== segment) {
      return null;
    }
  }
  return params;
}

/**
 * A tiny router: method + path with :params. It only FINDS a handler; it never runs one.
 * Register specific routes before parameter routes ("/events/featured" before "/events/:id"):
 */
export function createRouter() {
  const routes = [];
  const taken = new Set();

  function add(method, path, handler) {
    const upper = String(method).toUpperCase();
    if (!METHODS.has(upper)) throw new TypeError(`Unsupported method: ${method}`);
    if (typeof handler !== "function") throw new TypeError("A route handler must be a function");

    const parts = compile(path);
    const key = `${upper} ${shapeOf(parts)}`;
    if (taken.has(key)) throw new Error(`Route already registered: ${key}`);
    taken.add(key);
    routes.push({ method: upper, parts, handler });
  }

  function match(method, pathname) {
    const segments = splitRequestPath(pathname);
    if (!segments) return { kind: "not_found" };

    const wanted = method === "HEAD" ? "GET" : method;
    const allow = new Set();
    let found = null;

    for (const route of routes) {
      const params = matchParts(route.parts, segments);
      if (!params) continue;
      allow.add(route.method);
      if (!found && route.method === wanted) found = { kind: "found", handler: route.handler, params };
    }

    if (found) return found;
    if (allow.size > 0) {
      if (allow.has("GET")) allow.add("HEAD");
      return { kind: "method_not_allowed", allow: [...allow].sort() };
    }
    return { kind: "not_found" };
  }

  return {
    add,
    match,
    get: (path, handler) => add("GET", path, handler),
    post: (path, handler) => add("POST", path, handler),
    put: (path, handler) => add("PUT", path, handler),
    patch: (path, handler) => add("PATCH", path, handler),
    delete: (path, handler) => add("DELETE", path, handler),
  };
}
