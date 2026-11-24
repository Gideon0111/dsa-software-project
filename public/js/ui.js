function appendChild(parent, child) {
  if (child == null) return;
  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c);
    return;
  }
  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
  } else if (child instanceof Node) {
    parent.appendChild(child);
  }
}
/**
 * Create an element: el(tag, props, children)
 *
 * props supports:
 *  - on: { event: listener }  -> addEventListener
 *  - text: "..."              -> element.textContent (escaped via text node)
 *  - style: "..."             -> setAttribute("style", ...)
 *  - boolean true/false       -> present/absent attribute (e.g. required, disabled)
 *  - everything else          -> setAttribute(key, String(value))
 */
export function el(tag, props = {}, children = []) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (key === "on" && value && typeof value === "object") {
      for (const [type, listener] of Object.entries(value)) {
        if (typeof listener === "function") {
          element.addEventListener(type, listener);
        }
      }
    } else if (key === "text") {
      element.textContent = value;
    } else if (key === "style") {
      element.setAttribute("style", String(value));
    } else if (value === true) {
      element.setAttribute(key, "");
    } else if (value === false || value == null) {
      // skip absent attributes
    } else {
      element.setAttribute(key, String(value));
    }
  }

  appendChild(element, children);
  return element;
}

// Format whole cents as naira: 250000 -> ₦2,500.
export function formatCurrency(cents) {
  if (!Number.isSafeInteger(cents)) {
    throw new Error("formatCurrency: cents must be a whole number");
  }
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const naira = Math.floor(abs / 100);
  const kobo = abs % 100;
  const nairaStr = String(naira).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (kobo === 0) return `${sign}₦${nairaStr}`;
  return `${sign}₦${nairaStr}.${String(kobo).padStart(2, "0")}`;
}
