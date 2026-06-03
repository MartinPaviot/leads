# Cluster C — Template-Merge / Document-Generation Engines & Libraries (Technical Teardown)

**Scope:** Programmatically take a customer template (.docx / .pptx / .pdf) with placeholders/components and auto-fill or rewrite each component while preserving formatting. This is the *technical* "how", per format. Covers commercial APIs and dev libraries.

**Date:** 2026-06-03 · Tools used: WebSearch + WebFetch · ~18 sources (see end).

---

## 0. The one mental model that explains everything

There are **only three fundamental strategies** for "fill a template and keep the formatting", and every product/library is one of them (or a hybrid):

1. **In-place token substitution inside the original file's XML** (DOCX/PPTX/XLSX are ZIP-of-XML; OOXML). You edit the bytes that already carry the styling, so formatting survives *for free* because you never recreate it. → docxtemplater, docxtpl, docx-templates, Carbone, Windward/Fluent, Adobe DocGen, Conga, python-pptx.
2. **Regenerate the document from scratch** with a code API, optionally reusing a "master/theme". Formatting is whatever you write in code. → docx (npm), PptxGenJS, ReportLab-style PDF builders.
3. **Overlay / form-fill on a fixed canvas** (PDF only — PDFs are not reflowable). Either fill AcroForm fields or stamp text/images at absolute coordinates, then flatten. → pdf-lib, Apryse, DocSpring, Nutrient.

The format dictates which strategies are even possible:

| Format | Reflowable? | Strategy 1 (in-place XML) | Strategy 2 (regen) | Strategy 3 (overlay) |
|---|---|---|---|---|
| DOCX | Yes (text engine in Word/LO) | **Primary** | Possible | n/a |
| PPTX | Partly (fixed slide canvas, autofit text) | **Primary** | Possible | n/a |
| PDF  | **No** | n/a | "regen from extracted structure" | **Primary** |

Key consequence: **DOCX/PPTX templating is a solved, mature problem.** PDF "templating" is the hard one and is fundamentally a different activity (fill fields or stamp coordinates, NOT reflow content).

---

## 1. Placeholder / tagging mechanisms — PER FORMAT, PER LIBRARY

### 1a. DOCX

The OOXML reality that constrains every DOCX engine: text in a paragraph (`<w:p>`) is split into **runs** (`<w:r>`), where a run = a span of identical character formatting. Word *fragments runs unpredictably* (spellcheck, cursor moves) so a tag like `{{client_name}}` typed in Word may be split across 3 runs in the XML: `{{cli` `ent_na` `me}}`. **Every serious engine's first job is to "normalize/glue" runs back together so it can find the tag.** This single fact is why you can't just regex-replace text in the XML.

| Library | Tag syntax | Loops / repeats | Conditionals | Images | Notes |
|---|---|---|---|---|---|
| **docxtemplater** (JS) | Mustache-style `{name}` (single brace). `{.}` for primitive arrays. `{@rawXml}` raw XML. `{%img}` image. **Dash syntax** `{-w:tr items}…{/}` explicitly names the XML element to repeat. | `{#array}…{/array}` — place open tag in first cell of a table row, close in last cell → repeats the `<w:tr>`. | Same syntax `{#cond}…{/cond}`; inverted `{^cond}…{/cond}`. | `{%image}` inline / `{%%image}` block — **paid PRO image module**. Can ADD or REPLACE (write `{%img}` in the picture's alt-text). | Open-source core = text+loops+conditions for docx & pptx & xlsx. Loops/HTML/image/chart/slides = paid modules. |
| **docxtpl / python-docx-template** (Py) | Full **Jinja2**: `{{ var }}`, filters `{{ x|upper }}`. RichText inline styling via `{{r myrich }}` + `RichText()`/`R()`. | **Special structural tags** so Jinja can span XML boundaries: `{%tr ... %}` (table row), `{%tc ... %}` (column), `{%p ... %}` (paragraph), `{%r ... %}` (run). Lib strips the `tr/tc/p/r` and places the *real* Jinja tag at the correct XML node. | Native Jinja `{% if %}{% endif %}` (wrapped with the structural prefixes for multi-paragraph). | `InlineImage(tpl, path, width=Mm(40))` passed as a context var rendered by `{{ myimg }}`; plus `replace_pic()` / `replace_media()` to swap an existing embedded image by alt-text/filename. | **Hard limit:** a plain Jinja tag must live inside *one run of one paragraph*; cross-paragraph/row logic REQUIRES the `{%p/%tr%}` forms. |
| **docx-templates** (JS) | `INS`/`=`/bare = insert JS expression result. Delimiters configurable (default `+++`). | `FOR`/`END-FOR` (supports table rows, nested, JS `.filter()/.sort()` on the array). | `IF`/`END-IF` (any truthy JS expr). | `IMAGE` command (great for on-the-fly QR/charts/maps); `LINK` for hyperlinks; `HTML` command. | Differentiator: **arbitrary JavaScript** in tags via `EXEC`/`!`. Most "programmable" of the OSS docx tools. |
| **docx (npm)** | Not a templating lang — code API. But `patchDocument()` finds `{{placeholder}}` text and replaces with structured `Paragraph`/`TextRun`/`Table` content. | Build tables/loops in code; patch repeats by supplying arrays. | In code. | `ImageRun` in code. | Use when you also generate from scratch. patch keeps surrounding doc + (optionally) the placeholder's run formatting. |
| **easy-template-x** (JS) | `{simple}` mustache + `{#loop}{/loop}`, `{#cond}{/cond}`, image & raw-xml plugins. | Loop over table rows / paragraphs. | Conditions. | Image plugin. | MIT, free, lighter alt to docxtemplater core. |
| **Carbone** (JS/self-host/API) | `{d.path}` for data, `{c.path}` complement data. Loops by repeating a row with `{d.arr[i].field}` and a second row `{d.arr[i+1].field}` (the `i`/`i+1` pattern signals iteration). **150+ formatters** `{d.date:formatD('YYYY')}`. | Row/list repetition via the `[i]`/`[i+1]` convention; nested loops supported. | `:ifEQ`, `:hideBegin/:hideEnd`, `:show/:drop` formatters. | Image insertion, barcodes, charts. | Template is ANY office/text format (docx/odt/xlsx/ods/pptx/html/md/xml). Output same or → PDF via LibreOffice. |
| **Conga Composer** (SF) | Two modes: native **Word MERGEFIELD** (Insert > Field, view codes Alt-F9) OR **text-based** `{{FieldName}}`. | "Detail" regions = repeating rows pulled from related Salesforce records. | `IF` special merge field; `TableHide` to drop empty tables. | `Image` special merge field. | Picture switches for format: `\@` dates, `\#` numbers/currency — i.e. it rides Word's own field-formatting machinery. |
| **Windward / Fluent (Apryse)** | Office add-in inserts inline tags: `out`, `forEach`, `if`, `switch`, `chart`, image, link, equation. Tags authored *in Word/Excel/PowerPoint*. | `forEach` over a datasource. | `if`/`switch`. | image tag. | Connects 147 connectors + SQL/JSON/XML/OData; multiple datasources in one template. Engine walks tags in order. |
| **Adobe Document Generation API** | `{{var}}` text tags; conditionals with `= != >= > <= <`; tables (HTML `<table>` or markers); lists (HTML `<ul>/<ol>` or repeating sections); calculations via `expr()`; footnotes; Adobe Sign tags. **All tags are JSONata** → real expressions/aggregations. | Repeating table rows & sections from arrays. | Conditional show/hide. | Image tags (base64 or HTTPS URL <20 MB). | Authoring done with the **Adobe Document Generation Tagger** Word add-in: import sample JSON, click-to-insert. |

### 1b. PPTX

PPTX is OOXML too (`ppt/slides/slideN.xml`), so the same in-place-substitution model applies, BUT the canvas is fixed-size and text lives in **shapes / placeholders** (`<p:sp>` → `<p:txBody>` → `<a:p>` → `<a:r>`).

| Library | Tagging / fill mechanism |
|---|---|
| **docxtemplater + Slides module / pptx-sub / html-pptx** (JS) | Same `{tag}`, `{#loop}`, `{%image}` syntax inside text boxes. **Slides module (PRO)** = clone/repeat whole slides in a loop (e.g. one slide per product) and conditionally drop slides. **html-pptx module** = inject formatted HTML (tables, nested lists, styled text). |
| **python-pptx** (Py) | No template DSL — you iterate `prs.slides → slide.shapes → shape.text_frame → paragraph → run` and set `run.text`. **Critical rule:** assigning `shape.text = "..."` **destroys all run/paragraph formatting**; to preserve, edit the *first run's* `.text` and delete sibling runs, keeping that run's `<a:rPr>`. Placeholders accessible by idx via `slide.placeholders`. |
| **python-pptx-text-replacer** (Py) | Wrapper that search/replaces across all text locations while preserving each run's character formatting (does the run-surgery for you). |
| **PptxGenJS** (JS) | NOT a template-filler — generates decks from code (Strategy 2). Slide Masters give reusable styling. Every element needs absolute x/y/w/h. Use when "from scratch", not "fill the customer's deck". |
| **Aspose.Slides / Apryse / Adobe** | Commercial: placeholder management + high-fidelity fill; Apryse/Adobe also render PPTX→PDF. |

### 1c. PDF

There is **no concept of a reflowable placeholder** in a PDF body. Tagging is one of:

| Mechanism | What it is | Library/product |
|---|---|---|
| **AcroForm fields** | Named interactive fields (text/checkbox/radio/dropdown) baked into the PDF. You set values, regenerate field appearance, then flatten. | pdf-lib (`getTextField().setText()`, `form.updateFieldAppearances()`, `form.flatten()`), Apryse (FDF/XFDF import + `RefreshFieldAppearances`), DocSpring, Nutrient, iText, Syncfusion. |
| **FDF / XFDF data merge** | External data file listing field→value; merged into the AcroForm. Clean separation of data and template. | Apryse (import FDF/XFDF, then `RefreshAnnotAppearances` so Chrome/viewers render it). |
| **Absolute-coordinate overlay ("stamping")** | Draw text/images at (x,y) on a page; no field needed. You own positioning, wrapping, fonts. | pdf-lib `page.drawText()/drawImage()` + embedded font; Apryse `ElementBuilder`; DocSpring (visual editor assigns x/y/w/h per field, defaults auto-increment y). |
| **Regenerate from extracted structure** | Don't edit the PDF at all: parse it to a structured model (or treat the PDF as a *design reference*), then emit a brand-new PDF/DOCX. | Adobe PDF Extract API → JSON, then DocGen; LLM extraction → schema → regenerate. |

---

## 2. How formatting fidelity is preserved on fill

**The universal trick (Strategy 1):** the template author styles the *tag itself* in Word/PowerPoint/LibreOffice (font, size, colour, bold, paragraph style, table style). Because the engine only *replaces the text characters inside the already-styled run/paragraph* — it never recreates the run properties (`<w:rPr>` / `<a:rPr>`) — the output inherits the exact styling. Quotes confirming this design:

- docxtpl: "perform text replacement while preserving the format … template variables can be styled in Word (font, size, color)."
- Carbone: "When designers format tags within Word or LibreOffice, those visual properties persist in the output."
- Adobe DocGen: "Formatting applied to the placeholder variable in the document template will be retained in the output document."

**Run-gluing prerequisite (DOCX/PPTX):** before substitution the engine must merge the fragmented runs that Word created around the tag, replace text, then it can re-split. docxtemplater/docxtpl/docx-templates all do this internally; naïve regex-on-XML fails precisely because the tag is split across runs.

**RichText / mixed styling within one value:** when the *value* itself needs styling (e.g. a bolded word inside a sentence), plain substitution isn't enough — you use `RichText()` (docxtpl, `{{r}}`), the HTML module (docxtemplater `{~html}` / html-pptx), or build runs in code (docx npm). Raw-XML tags (`{@xml}`, INS-with-XML) are the escape hatch but operate at paragraph level.

**PDF fidelity:** AcroForm fields carry their own font/size/colour in the field's default-appearance (`/DA`) and appearance stream; on fill you call `updateFieldAppearances()`/`RefreshAppearance` to regenerate the visual so all viewers (notably Chrome's PDF.js) render consistently, then `flatten()` to bake it permanently. Coordinate overlay fidelity is entirely on you (embed the right font, match size/colour, compute wrapping yourself).

**PDF-from-Office fidelity (the cheap high-fidelity path):** template in DOCX/ODT, fill via Strategy 1, then convert to PDF with **LibreOffice headless** (Carbone, Documint, many self-host stacks) — LibreOffice owns pagination/headers/footers/overflow. Adobe DocGen and Apryse render to PDF with their own engines (higher Office-fidelity, no LO dependency).

---

## 3. The HARD parts and how they're solved

### 3a. PPTX — fill text without breaking layout; replace images; auto-resize

- **Breaking slide layout:** the #1 footrun is `shape.text = "..."` (python-pptx) which **nukes paragraph + font formatting**. Solution = run-level surgery: keep the first `<a:r>`, set its text, delete the other runs in the paragraph, preserving `<a:rPr>`. docxtemplater does this for you; raw python-pptx you do it yourself (or use python-pptx-text-replacer).
- **Text longer than the box:** PPTX shapes have an autofit setting in `<a:bodyPr>`:
  - `<a:noAutofit/>` — text overflows the box (ugly).
  - `<a:normAutofit fontScale="…" lnSpcReduction="…"/>` — **shrink text to fit** (this is "Shrink text on overflow"). The catch: **PowerPoint computes `fontScale` at edit time; it is NOT recomputed on open.** So if you inject more text programmatically, you must *recalculate fontScale yourself* (estimate rendered text height vs shape height) and write it back, or the box overflows until a human clicks into it. There is no headless layout engine in python-pptx to do this — it's an explicit, approximate calculation (a known sharp edge).
  - `<a:spAutoFit/>` — resize the *shape* to the text (moves layout — usually undesirable on a fixed slide).
- **Replacing images:** swap the relationship target. docxtemplater image module: put `{%img}` in the picture's **alt-text/name** and it replaces that picture in place (keeps position/size). python-pptx: replace the image part's blob, or insert a new `picture` and delete the old; preserve the `<a:xfrm>` (offset/extent) to keep position. Keeping the original `<a:xfrm>` is what stops the image from jumping.
- **Repeating slides:** only the **PRO Slides module** (docxtemplater) or commercial SDKs clone whole slides in a loop cleanly (fix-up of slide IDs, rels, layout refs). Hand-rolling slide cloning in python-pptx is error-prone (relationship + notesSlide bookkeeping).

### 3b. PDF — not reflowable: the real options & trade-offs

| Option | How | Pros | Cons / when it breaks |
|---|---|---|---|
| **A. AcroForm fill + flatten** | Template PDF already has named fields; set values, `updateFieldAppearances`, `flatten`. | Cleanest data/template separation; fields carry their own styling; viewer-consistent after appearance refresh. | Requires the PDF to *have* fields (most customer PDFs don't). Field box is fixed size → long values clip or shrink. Forgetting `updateFieldAppearances` → blank in Chrome. |
| **B. Coordinate overlay (stamp)** | `drawText/drawImage` at (x,y); flatten optional. | Works on ANY PDF, no fields needed; full control. | YOU compute x/y, font, size, and **wrapping** (pdf-lib does NOT auto-wrap/reflow). Brittle to template layout changes; multi-line/variable-length text is painful; must embed exact font for visual match. |
| **C. Regenerate from structure** | Extract content/layout (Adobe PDF Extract → JSON, or treat PDF as design ref) → fill a *DOCX/HTML* template → render back to PDF. | Real reflow, headers/footers, variable-length content all work; future-proof. | Most engineering; you must reconstruct the design once; not "edit the original bytes". Best when content length varies a lot. |
| **D. PDF → DOCX → edit → PDF** | Convert PDF to editable DOCX (Nutrient/Apryse/Adobe), template it, render back. | Reuses the mature DOCX toolchain + reflow. | PDF→DOCX conversion fidelity is imperfect (tables, columns, fonts drift); risky for pixel-exact brand docs. |

**Verdict:** if the customer hands you a *form-like* PDF (contracts, gov forms, invoices) → **A** (auto-detect/build fields, then fill). If it's a *designed* proposal/brochure PDF and content length varies → **C** (regenerate from a DOCX/HTML template) gives reflow; **B** only for small, fixed-position inserts (a name, a date, a signature). pdf-lib's hard limit is explicit in its docs: drawText places text, it does **not** reflow, wrap, or edit existing body-text content streams.

### 3c. DOCX — variable-length content reflowing tables/sections

This is DOCX's *strength*: the Word/LibreOffice text engine reflows automatically. Mechanisms:
- **Repeating table rows:** loop tags on `<w:tr>` (`{#rows}…{/rows}` first/last cell; docxtpl `{%tr%}`; Carbone `[i]/[i+1]`; Adobe repeating-section). Word recomputes table height, page breaks, row-splitting across pages on open. No manual layout math needed.
- **Variable paragraphs/sections:** `{%p%}` (docxtpl), `FOR` over paragraphs (docx-templates), conditional sections. Pagination, headers, footers, and "keep with next" are handled by the renderer.
- **Empty-data cleanup:** `TableHide` (Conga), inverted sections `{^x}` (docxtemplater), `:hideBegin/hideEnd` (Carbone) remove rows/tables when arrays are empty — avoids dangling empty tables.
- **The only real DOCX gotcha** is the run-fragmentation problem (§1a/§2) and tags that must stay within a run; the engines abstract this. Output PDF pagination is delegated to LibreOffice/Word/Adobe, not the templating lib.

---

## 4. Ingesting an arbitrary, un-tagged customer template (the core hard problem)

"We did NOT author this template — how do we make it fillable?" There are exactly four approaches in the wild, roughly in order of robustness↑ / automation↓:

**Approach 1 — Mark-once visual editor (what most commercial products actually do).**
The product gives a human a UI to drop tags/fields onto the uploaded doc *one time*; the marked template is then reused forever.
- **DocSpring:** upload PDF → if it has an AcroForm, fields auto-import; otherwise **drag-and-drop fields** in a visual editor; each field stores x/y/w/h (defaults auto-increment y). Then POST JSON → filled PDF.
- **Adobe / Windward-Fluent / Conga:** a **Word/Office add-in (Tagger)** where you import sample JSON and click where each tag goes. The mark-once step is explicit and human-driven.
- **Documint / Carbone Studio:** template designer with preview-on-real-data before automating.
- **Trade-off:** highest fidelity & control, requires a one-time human pass per template. This is the industry-standard answer because it's reliable and auditable.

**Approach 2 — Heuristic auto-detection (geometry/structure), no LLM.**
Detect "blanks to fill" from the document's own structure.
- **Instafill.ai "flat-to-fillable" pipeline (best documented example):** dual-detector geometry: `detect_boxes_fitz()` on **PyMuPDF** finds table borders, underlines, red boxes from vector data; fallback `detect_blanks()` on **pdfplumber** finds blank areas via whitespace analysis of the text layer. Emits **standard AcroForm** (works in Adobe/browsers/any lib).
- JustFill / Formester / Jotform "Detect Layout": scan for input lines, boxes, checkboxes, table cells.
- **Trade-off:** fully automatic, but produces *unlabeled* fields ("field_7") — you still need to map field→data, and it misfires on logos/decorative lines (hence Approach 3).

**Approach 3 — LLM detection + schema mapping (the 2025/26 frontier).**
Use a vision/text LLM to (a) find placeholders/blanks, (b) **name them semantically**, (c) map to your data schema.
- **Instafill** layers an LLM pass `get_nonsense_fields_from_page()` to **remove false positives** (fields wrongly placed on logos/borders/headers) — typically 2–8 per complex form. So even the geometry pipeline uses an LLM as a *filter*.
- **Structured-output extraction** (OpenAI/Anthropic/Gemini/Mistral structured outputs, **LlamaExtract** which can *infer a schema* from a doc set, the PARSE research method): pass a JSON schema, get back which spans map to which fields. For DOCX/PPTX you'd run the LLM over the extracted text to locate human-written placeholders like "[Client Name]", "<DATE>", "XXXX", "Lorem ipsum", then convert them to `{{client_name}}` tags or a field map.
- **Trade-offs:** highest automation + semantic naming (auto-maps to schema), but **non-deterministic** (GPT-4-class shows ~12% invalid-output on complex schemas), needs validation, and coordinates from an LLM are unreliable → best as a *labeler/false-positive filter* on top of deterministic geometry/text extraction, not as the sole positioner.

**Approach 4 — Convert-then-template.**
PDF→DOCX (Nutrient/Apryse/Adobe), then run any DOCX templating engine on the now-editable doc; or PDF→Adobe-Extract JSON→regenerate. Good when you want reflow; risks conversion drift.

**What tools actually do, summarized:** commercial products overwhelmingly choose **Approach 1 (mark-once)** because it's reliable and lets the customer own correctness. The automated frontier is **geometry-detection (Approach 2) gated/labeled by an LLM (Approach 3)** — exactly the Instafill architecture: deterministic detector for *where*, LLM for *what it means* and *false-positive removal*. Pure-LLM positioning is not trusted in production.

---

## 5. Licensing / cost notes (commercial SDKs)

| Product | Model | Indicative cost |
|---|---|---|
| **docxtemplater** | OSS core (text+loops+conditions, docx/pptx/xlsx) **free**; modules (image, html, slides, xlsx, chart, table, etc.) are **paid PRO**, sold per plan with npm auth tokens. | PRO subscription (image/html/slides are the ones you'll want). |
| **docxtpl / python-pptx / docx (npm) / docx-templates / easy-template-x / pdf-lib / PptxGenJS** | **Open-source, free** (MIT/Apache/BSD-ish). | $0. The whole Node/Python OSS stack is free. |
| **Carbone** | OSS community edition (AGPL) + paid **Carbone Studio / Cloud** API + Enterprise on-prem. AGPL has copyleft implications if self-hosting in a closed product. | Free OSS (AGPL) → paid cloud/enterprise tiers. |
| **Apryse (PDFTron) SDK** | Per developer-seat + server/production licenses, or usage-based API. Custom quotes, no public list. | Startup entry ~**$1,500/yr**; typical **$9.3k–$36k/yr**; enterprise (10+ devs/multi-server) **$150k–$500k+/yr**. Premium support +15–25%. |
| **Nutrient / PSPDFKit** | Per-app/per-domain licensing; multiple products = multiplied cost. DocGen/templating is a **separate add-on fee**. | DocGen/templating commonly **$10k–$30k/yr** depending on volume; full quotes via sales. |
| **Adobe Document Generation API** (PDF Services) | Usage-based "document transactions" via Adobe PDF Services; free tier then metered. Tagger Word add-in is free. | Pay-per-transaction; bundled in PDF Services pricing. |
| **Conga Composer** | Salesforce-AppExchange per-user/org subscription. | Per-user SaaS (SF ecosystem). |
| **Windward / Fluent (Apryse)** | Commercial license (designer + engine), now under Apryse. | Quote-based. |
| **DocSpring / Documint / APITemplate.io / Templated / DocSpring** | SaaS, **per-document / monthly tiers**. | Low-cost SaaS (tens–hundreds $/mo by volume). |

**Takeaway:** you can build the *entire* DOCX/PPTX/PDF fill pipeline on **$0 OSS** (docxtemplater/docxtpl + python-pptx + pdf-lib). You pay only for: (a) docxtemplater PRO modules (images/html/slides) — cheap; (b) high-fidelity Office→PDF rendering or PDF↔Office conversion without LibreOffice (Apryse/Nutrient/Adobe) — expensive; (c) a hosted no-code template designer (DocSpring/Documint/Carbone Cloud).

---

## 6. Recommendation matrix (Node/TypeScript stack)

| Need | Recommended | Why / fallback |
|---|---|---|
| **.docx fill (variable-length, tables, reflow)** | **docxtemplater** (core, free) + PRO image/html modules if needed. | Mature run-gluing, loops over `<w:tr>`, conditions, biggest ecosystem, TS types. Reflow is free (Word/LO engine). Alt: **docx-templates** if you want arbitrary JS in tags; **easy-template-x** if you want fully-MIT no-PRO. |
| **.docx generate-from-scratch** | **docx (npm)** | Declarative TS API; or docxtemplater `patchDocument`-style. |
| **.pptx fill (keep slide layout)** | **docxtemplater + Slides/html-pptx PRO modules** | Handles run-surgery + slide cloning + image replace-by-alt-text safely. For free/Python: **python-pptx** with first-run editing (never `shape.text=`). Remember to **recompute `normAutofit fontScale`** when injecting long text. |
| **.pptx generate-from-scratch** | **PptxGenJS** | Code-first decks with Slide Masters. Not for filling a customer deck. |
| **.pdf — customer form/contract (fields)** | **pdf-lib** (free): set fields → `updateFieldAppearances()` → `flatten()`. | If the PDF lacks fields, auto-create them first (see ingest). Upgrade to **Apryse** only if you need pixel-perfect appearance, XFDF, or heavy throughput. |
| **.pdf — designed proposal, variable content** | **Regenerate**: build a DOCX/HTML template, fill it, render to PDF (LibreOffice headless, or Apryse/Adobe for higher fidelity). | PDFs don't reflow; editing the original is a dead end for variable-length content. |
| **.pdf — tiny fixed inserts (name/date/sig)** | **pdf-lib coordinate overlay** (`drawText`/`drawImage` + embedded font) then flatten. | You own wrapping; only viable for short, fixed-position values. |
| **One pipeline, all 4 formats + PDF output** | **Carbone (self-host)** behind a service. | Template = real Office doc, formatters, loops; LibreOffice does PDF. Mind AGPL. Pure-JS alt: docxtemplater (docx/pptx/xlsx) + LibreOffice/Gotenberg for →PDF. |

### Ingesting an un-tagged customer template — opinionated strategy

**Default to MARK-ONCE, augment with LLM-DETECT, reserve REGENERATE for variable PDFs.**

1. **Primary: mark-once.** Build a lightweight in-app template editor. On upload:
   - DOCX/PPTX: render a preview; let the user click text to convert "[Client Name]" → `{{client_name}}` (store a field map). One human pass, infinitely reusable, auditable. This is what Adobe/Conga/Windward/DocSpring all do, and it's the only approach that guarantees correctness on brand-critical docs.
2. **Accelerator: LLM-detect + schema-map (don't position, just label).** Before the human marks, run an LLM over the extracted text to *propose* placeholders and map them to your schema (`client_name`, `deal_value`, `start_date`, `[scope of work]`, "Lorem ipsum" blocks). Present as **pre-filled suggestions the human confirms** — cuts marking time ~80% while keeping a human in the loop. Use structured outputs (Anthropic/OpenAI) with a JSON schema; treat output as suggestions, validate before commit. Pattern mirrors Instafill: deterministic extraction for location, **LLM for semantics + false-positive removal**.
3. **For PDFs specifically:**
   - Form-like PDF → run a **geometry detector** (PyMuPDF for boxes/underlines + pdfplumber for blanks) to auto-create AcroForm fields, then LLM-label them, then human-confirm, then fill with pdf-lib. (= the Instafill flat-to-fillable architecture.)
   - Designed/variable PDF → **don't edit it**: reconstruct as a DOCX/HTML template (once), then it's just the DOCX path → render to PDF.
4. **Never trust pure-LLM coordinate positioning** in production — non-deterministic, ~12% invalid on complex schemas. LLM = labeler/mapper/filter; geometry + human = positioner.

**Bottom line for the build:** Node OSS gets you 95% for free — **docxtemplater** (docx+pptx, + PRO image/slides), **pdf-lib** (PDF forms/overlay), **PptxGenJS/docx** (from-scratch), **LibreOffice/Gotenberg** for →PDF. Spend money only on (a) docxtemplater PRO modules, (b) Apryse/Nutrient if you need LibreOffice-free high-fidelity Office↔PDF, (c) the LLM API for the mark-once accelerator. Ingestion = **mark-once UI, LLM-assisted, human-confirmed**; regenerate (not edit) for variable-length PDFs.

---

## Sources
- docxtemplater — tag types: https://docxtemplater.com/docs/tag-types/
- docxtemplater — image module: https://docxtemplater.com/modules/image/
- docxtemplater — slides module: https://docxtemplater.com/modules/slides/ ; html-pptx: https://docxtemplater.com/modules/html-pptx/
- docxtemplater — site/overview: https://docxtemplater.com/ ; GitHub: https://github.com/open-xml-templating/docxtemplater
- python-docx-template (docxtpl) — docs: https://docxtpl.readthedocs.io/ ; GitHub: https://github.com/elapouya/python-docx-template
- python-pptx — text/working with text: https://python-pptx.readthedocs.io/en/stable/user/text.html ; autofit: https://python-pptx.readthedocs.io/en/latest/dev/analysis/txt-autofit-text.html
- python-pptx-text-replacer: https://pypi.org/project/python-pptx-text-replacer/
- docx-templates: https://github.com/guigrpa/docx-templates ; npm: https://www.npmjs.com/package/docx-templates
- docx (npm) patchDocument: https://docx.js.org/api/functions/patchDocument.html
- easy-template-x: https://github.com/alonrbar/easy-template-x
- Carbone — universal template: https://carbone.io/features/universal-template.html ; GitHub: https://github.com/carboneio/carbone
- pdf-lib — PDFForm API: https://pdf-lib.js.org/docs/api/classes/pdfform
- Apryse — server forms / fill fields: https://docs.apryse.com/core/guides/features/forms ; https://pdftron.com/documentation/core/guides/features/forms/fill-fields
- Apryse — pricing: https://apryse.com/pricing ; https://www.g2.com/products/apryse-pdf-sdk/pricing
- DocSpring — template editor / add fields: https://docspring.com/docs/template_editor/ ; https://docspring.com/docs/api/add_fields_to_template.html
- Nutrient/PSPDFKit — server Word gen: https://pspdfkit.com/guides/document-engine/ms-office/create-word-documents/ ; PDF-from-Word template: https://www.nutrient.io/guides/web/pdf-generation/from-word-template/
- Adobe Document Generation — template tags: https://developer.adobe.com/document-services/docs/overview/document-generation-api/templatetags/ ; getting started: https://developer.adobe.com/document-services/docs/overview/document-generation-api/gettingstarted ; Word add-in: https://developer.adobe.com/document-services/docs/overview/document-generation-api/wordaddin
- Conga Composer — Word merge templates / special merge fields: https://documentation.conga.com/en/composer-for-salesforce/current/composer-for-administrators/creating-composer-templates/word-templates/word-template-basics/about-microsoft-word-merge-templates
- Windward / Fluent (Apryse) — out tag reference: https://fluent.apryse.com/documentation/designer-guide/Reference/outTagReference ; Windward overview: https://www.windwardstudios.com/overview
- Documint — how it works: https://docs.documint.me/introduction/how-it-works
- Instafill.ai — flat-to-fillable pipeline: https://instafill.ai/features/flat-to-fillable-conversion
- PptxGenJS: https://github.com/gitbrent/PptxGenJS
- OOXML autofit (normAutofit/fontScale): http://officeopenxml.com/drwSp-text-bodyPr-fit.php
- LLM structured extraction / schema mapping: https://simonwillison.net/2025/Feb/28/llm-schemas/ ; LlamaExtract: https://www.llamaindex.ai/blog/introducing-llamaextract-beta-structured-data-extraction-in-just-a-few-clicks
