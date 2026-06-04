# PROPOSAL-005: PPTX support

Extends the engine to PowerPoint. The leverage: **detection, fill, and the trust
stack are format-agnostic and reused** — only extraction + assembly are
PPTX-specific (PresentationML keeps text in the DrawingML `a:` namespace inside
slide shapes; slide order comes from `ppt/presentation.xml` + its rels).

## Requirements
**AC1** Upload of a `.pptx` is accepted → `sourceFormat='pptx'`, slide text + a
slide-title outline extracted; on a non-pptx, status `failed` (never throws).
**AC2** Detection runs unchanged on `{text, outline}` → components anchored to slide
titles.
**AC3** Fill runs unchanged (field resolve + grounded sections + trust). Download
assembles a filled `.pptx`: for each component anchored to a slide title, the first
non-title text placeholder's body is replaced with the content; every other zip
entry (masters, layouts, theme, media) is preserved.
**AC4** A component whose title can't be located is returned in `unplaced`.

## Design
- `lib/proposals/pptx.ts` — `extractPptxText` / `extractPptx` (never-throws wrapper)
  + `assembleFilledPptx`. Reuses `readAllZipEntries` / `writeZip` /
  `decodeXmlEntities` / `xmlEscape` and the shared `DocxFillComponent` / `DocHeading`
  / `AssembleResult` types from `ooxml.ts`.
- Upload route: branch the extractor by extension (`.docx`→`extractDocx`,
  `.pptx`→`extractPptx`), persist the chosen `sourceFormat`.
- Download route: branch the assembler by `sourceFormat`; set MIME + filename ext.
- UI: file input `accept=".docx,.pptx"`.
- No migration; no new skill/route/chat-tool (002/003 surfaces are format-agnostic).

## Tasks
1. `pptx.ts` (+ fixture round-trip test).
2. Upload + download route branching.
3. UI accept + copy.
4. tsc + full regression. PASS → 005 done.
