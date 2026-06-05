/**
 * DOCX ingestion: turn uploaded bytes into { text, outline } for the
 * component detector. Never throws — a malformed/corrupt file degrades to
 * empty text + an `error` code so the route can persist status='failed'.
 */

import { extractDocxText, type DocHeading } from "./ooxml";

export type { DocHeading };

export interface IngestResult {
  text: string;
  outline: DocHeading[];
  error?: string;
}

export function extractDocx(bytes: Buffer | Uint8Array): IngestResult {
  try {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const { text, outline } = extractDocxText(buf);
    return { text, outline };
  } catch (e) {
    return {
      text: "",
      outline: [],
      error: e instanceof Error ? e.message : "extract_failed",
    };
  }
}
