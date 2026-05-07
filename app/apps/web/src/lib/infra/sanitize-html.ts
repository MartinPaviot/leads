const ALLOWED_TAGS = new Set([
  "p", "br", "b", "i", "u", "strong", "em", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "span", "div", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "th", "td", "img", "hr",
]);

const ALLOWED_ATTR = new Set([
  "href", "target", "rel", "src", "alt", "width", "height",
  "style", "class", "colspan", "rowspan",
]);

const EVENT_ATTR_RE = /^on/i;

function walk(node: Node): void {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }

    for (const attr of Array.from(el.attributes)) {
      if (!ALLOWED_ATTR.has(attr.name.toLowerCase()) || EVENT_ATTR_RE.test(attr.name)) {
        el.removeAttribute(attr.name);
      }
    }

    if (tag === "a") {
      el.setAttribute("rel", "noopener noreferrer");
      el.setAttribute("target", "_blank");
      const href = el.getAttribute("href") ?? "";
      if (href.startsWith("javascript:") || href.startsWith("data:")) {
        el.setAttribute("href", "#");
      }
    }

    if (tag === "img") {
      const src = el.getAttribute("src") ?? "";
      if (src.startsWith("javascript:") || src.startsWith("data:text")) {
        el.removeAttribute("src");
      }
    }
  }

  const children = Array.from(node.childNodes);
  for (const child of children) walk(child);
}

export function sanitizeHtml(dirty: string): string {
  if (typeof window === "undefined") {
    return dirty
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/<object[\s\S]*?<\/object>/gi, "")
      .replace(/<embed[\s\S]*?>/gi, "")
      .replace(/\bon\w+\s*=/gi, "data-removed=");
  }

  const doc = new DOMParser().parseFromString(dirty, "text/html");
  walk(doc.body);
  return doc.body.innerHTML;
}
