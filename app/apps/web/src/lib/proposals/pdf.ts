/**
 * PROPOSAL-006 (regenerate path): a zero-dependency PDF generator that renders a
 * filled proposal as a clean, paginated text PDF. Used for "Download as PDF".
 *
 * PDFs do not reflow, so we cannot fill a customer's PDF *layout* without a PDF
 * library (pdf-lib — needs network to install) or LibreOffice. This is the
 * documented "regenerate" path: content-faithful, not layout-faithful. True
 * AcroForm field-fill / PDF ingest is specified for the pdf-lib backend.
 *
 * Output is an uncompressed PDF-1.4 with a correct xref table; latin-1 text with
 * WinAnsi encoding so French accents render. Validated structurally in tests; a
 * real visual check is opening it in a PDF viewer.
 */

export interface PdfComponent {
  label: string;
  content: string;
  kind: string;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Map to latin-1 (WinAnsi covers French); replace anything outside with '?'. */
function toLatin1(s: string): string {
  let out = "";
  for (const ch of s) out += ch.charCodeAt(0) <= 0xff ? ch : "?";
  return out;
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (line && line.length + word.length + 1 > width) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

const PER_PAGE = 46;

export function renderProposalPdf(components: PdfComponent[]): Buffer {
  // 1) Flatten to display lines (heading per component label, wrapped content).
  const lines: Array<{ text: string; heading: boolean }> = [];
  for (const c of components) {
    lines.push({ text: c.label.toUpperCase(), heading: true });
    for (const l of wrap(c.content || "—", 92)) lines.push({ text: l, heading: false });
    lines.push({ text: "", heading: false });
  }
  if (lines.length === 0) lines.push({ text: "(empty proposal)", heading: false });

  // 2) Paginate.
  const pages: Array<Array<{ text: string; heading: boolean }>> = [];
  for (let i = 0; i < lines.length; i += PER_PAGE) pages.push(lines.slice(i, i + PER_PAGE));

  // 3) Build objects: 1=Catalog, 2=Pages, 3=Font, then per page Page+Contents.
  let nextObj = 4;
  const pageRefs: number[] = [];
  const bodyObjs: Array<{ num: number; body: string }> = [];
  for (const page of pages) {
    const pageNum = nextObj++;
    const contentNum = nextObj++;
    pageRefs.push(pageNum);
    let stream = "BT /F1 11 Tf 14 TL 72 720 Td\n";
    for (const ln of page) {
      const size = ln.heading ? 13 : 11;
      stream += `/F1 ${size} Tf (${esc(toLatin1(ln.text))}) Tj T*\n`;
    }
    stream += "ET";
    const length = Buffer.byteLength(stream, "latin1");
    bodyObjs.push({
      num: pageNum,
      body: `<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F1 3 0 R>>>> /Contents ${contentNum} 0 R>>`,
    });
    bodyObjs.push({ num: contentNum, body: `<</Length ${length}>>\nstream\n${stream}\nendstream` });
  }

  // 4) Assemble with a byte-accurate xref table.
  const maxObj = nextObj - 1;
  const offsets: number[] = [];
  let pdf = "%PDF-1.4\n";
  const addObj = (num: number, body: string) => {
    offsets[num] = Buffer.byteLength(pdf, "latin1");
    pdf += `${num} 0 obj\n${body}\nendobj\n`;
  };
  addObj(1, "<</Type /Catalog /Pages 2 0 R>>");
  addObj(2, `<</Type /Pages /Kids [${pageRefs.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageRefs.length}>>`);
  addObj(3, "<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>");
  for (const o of bodyObjs) addObj(o.num, o.body);

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= maxObj; n++) {
    xref += `${String(offsets[n] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer\n<</Size ${maxObj + 1} /Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
