/**
 * Text-direction detection for the reading pane + list (INBOX-R10).
 *
 * HTML email bodies get `dir="auto"` (the browser picks per element from the
 * first strong character). But list snippets and headers are short and often
 * start with an LTR token ("Re:", a quote mark) even when the content is RTL —
 * `dir="auto"` would mis-align those. `looksRtl` scans the whole string and
 * reports RTL when right-to-left script is at least as prevalent as Latin, so we
 * can set `dir` explicitly where first-strong-char is unreliable. Pure + tested.
 */

// Hebrew, Arabic (+ supplement/extended), Syriac, Thaana, Arabic presentation forms.
const RTL_RE =
  /[֐-׿؀-ۿ܀-ݏݐ-ݿހ-޿ࢠ-ࣿיִ-﷿ﹰ-﻿]/g;
const LATIN_RE = /[A-Za-zÀ-ɏ]/g;

export function looksRtl(text: string): boolean {
  if (!text) return false;
  const rtl = (text.match(RTL_RE) || []).length;
  if (rtl === 0) return false;
  const latin = (text.match(LATIN_RE) || []).length;
  return rtl >= latin;
}

/** Convenience for JSX `dir` props. */
export function dirOf(text: string): "rtl" | "ltr" {
  return looksRtl(text) ? "rtl" : "ltr";
}
