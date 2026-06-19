/**
 * Snippet/template variable interpolation + recipient parsing (INBOX-C06 core).
 * Pure + unit-tested.
 *
 * interpolateTemplate fills {{firstName}}-style placeholders from a values map,
 * blanking any unfilled variable and REPORTING it so the composer can warn
 * before send (never ships a literal "{{firstName}}"). parseRecipients turns a
 * CC/BCC string into deduped valid addresses + the rejects. CRM-bound variable
 * resolution + the snippet store/picker UI are residual.
 */

export interface InterpolateResult {
  text: string;
  /** Variables referenced but not supplied — drives a pre-send warning. */
  missing: string[];
}

export function interpolateTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
): InterpolateResult {
  const missing: string[] = [];
  const text = (template || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v == null || v === "") {
      missing.push(key);
      return "";
    }
    return String(v);
  });
  return { text, missing: [...new Set(missing)] };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Parse a CC/BCC string ("a@b.c, Name <d@e.f>; bad") into valid + invalid. */
export function parseRecipients(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of (raw || "").split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const addr = part.replace(/^.*<([^>]+)>.*$/, "$1").trim();
    if (EMAIL_RE.test(addr)) {
      const k = addr.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        valid.push(addr);
      }
    } else {
      invalid.push(part);
    }
  }
  return { valid, invalid };
}
