/**
 * Deterministic entity extraction from message text (INBOX-S05 core).
 *
 * The hard, normalizable entities — emails, URLs, money amounts, dates, phone
 * numbers — via vetted regexes. Pure + unit-tested. The LLM NER for people /
 * companies, the deterministic CRM resolution (reuse the sender→contact resolver,
 * never a second matcher), confidence chips and disambiguation are residual.
 */

export interface ExtractedEntities {
  emails: string[];
  urls: string[];
  amounts: string[];
  dates: string[];
  phones: string[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = /https?:\/\/[^\s<>()]+/g;
const AMOUNT =
  /(?:[$€£]\s?\d[\d'.,]*|\bCHF\s?\d[\d'.,]*|\b\d[\d'.,]*\s?(?:USD|EUR|GBP|CHF|dollars?|euros?|pounds?)\b)/gi;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const NUM_DATE = /\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/g;
const TEXT_DATE =
  /\b(?:\d{1,2}\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?:\s+\d{1,2})?(?:,?\s+\d{4})?\b/gi;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?(?:[\s.-]\d{2,4}){2,4}/g;

function uniq(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}
function uniqCI(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr.map((x) => x.trim()).filter(Boolean)) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

export function extractEntities(text: string): ExtractedEntities {
  const t = text || "";
  const dates = uniq([
    ...(t.match(ISO_DATE) || []),
    ...(t.match(NUM_DATE) || []),
    ...(t.match(TEXT_DATE) || []),
  ]);
  // Phones: require ≥9 digits so 8-digit ISO dates / short numbers don't qualify.
  const phones = uniq((t.match(PHONE) || []).filter((p) => p.replace(/\D/g, "").length >= 9));
  return {
    emails: uniqCI(t.match(EMAIL) || []),
    urls: uniqCI(t.match(URL) || []),
    amounts: uniq(t.match(AMOUNT) || []),
    dates,
    phones,
  };
}
