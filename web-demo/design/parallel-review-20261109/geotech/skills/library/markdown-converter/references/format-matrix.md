# Local format matrix

The bundled runtime performs every listed conversion inside the Agent process. It does not call a website or conversion API, and generated artifacts do not receive a logo, watermark, promotional footer, product name, or injected attribution.

## Inputs converted to editable Markdown

| Input | Local implementation | Expected preservation | Typical loss or boundary |
| --- | --- | --- | --- |
| Markdown | UTF-8 reader | Original source | None unless another target normalizes it |
| HTML | Turndown conversion | Headings, paragraphs, lists, links, code, simple tables | CSS, scripts, layout, embedded widgets |
| TXT | List-aware normalization | Text and recognizable bullets/numbers | Formatting absent from the source |
| CSV | RFC-style parser | Cells, headers, quoted commas | Formulas, styles, multiple sheets |
| JSON | Structured object/array renderer | Keys, arrays, scalar values | Schema meaning and application behavior |
| XML | XML structure renderer | Elements, values, supported attributes | Mixed content and namespaces can simplify |
| DOCX | Mammoth → safe HTML → Markdown | Paragraphs, headings, lists, links, simple tables | Complex layout, media, comments, tracked changes, macros |
| XLSX | Bounded SheetJS parser | Sheet data as Markdown tables | Formulas, styles, charts, workbook behavior |
| PPTX | JSZip OOXML text extractor | Slide titles and text in presentation order | Design, animation, media, notes, exact spacing |
| Text PDF | PDF.js text extraction with reading-order heuristics | Searchable text, likely headings, bullets, basic paragraphs | Page layout, columns, tables, formulas, precise typography |
| Scanned PDF | PDF.js raster extraction → bundled Tesseract OCR | Printed raster text in eng/spa/deu/jpn/chi_sim | Handwriting, low resolution, vector-only pages, complex columns/tables, exact punctuation; proofread required |

PDF input limits: 30 MB, 100 pages total, 20 OCR pages, and 20 million pixels per OCR page. OCR runs only for pages without a usable text layer. The runtime never uploads a PDF as a fallback.

Other bounded readers include a 10 MB XLSX limit, at most 25 sheets, 10,000 rows per sheet, and 200 columns per sheet.

## Markdown outputs

| Output | Local implementation | Verification | Important boundary |
| --- | --- | --- | --- |
| Markdown / formatted Markdown | UTF-8 source writer | Non-empty UTF-8 | Formatter normalizes conservative syntax and spacing |
| HTML | Safe standalone serializer | Doctype or `<html>` | Active content and dangerous URLs are removed |
| TXT | Token-aware text writer | Non-empty UTF-8 | Formatting is intentionally removed |
| CSV | Markdown-table extractor | Non-empty UTF-8 CSV | Use when the source contains a real Markdown table |
| JSON | Markdown token tree | Parseable JSON | Syntax structure, not arbitrary document semantics |
| Searchable PDF | pdfmake text layout with embedded Noto CJK font | PDF signature, pages, non-empty PDF.js text extraction | Searchable/selectable text; not pixel-identical browser print; remote images become alt text; emoji depends on font coverage; maximum 100 pages |
| DOCX | `docx` OOXML generator | ZIP + `word/document.xml` | Images currently become text placeholders |
| XLSX | SheetJS workbook generator | ZIP + `xl/workbook.xml` | Tables are primary; prose goes to a content sheet |
| PPTX | PptxGenJS text deck | ZIP + `ppt/presentation.xml` | Text-oriented slides without animations or presenter notes |
| EPUB | JSZip EPUB package | EPUB mimetype/container | External media packaging and advanced navigation are limited |
| LaTeX / AsciiDoc / RTF / RST | Token converters | Non-empty UTF-8 | Inspect lists, code, math, links, and tables |
| Confluence | Legacy Wiki Markup writer | Non-empty UTF-8 | Not a modern Confluence Cloud API or universal paste format |
| Notion | Import-oriented Markdown writer | Non-empty UTF-8 | Not a Notion API import |
| Slides | Standalone Reveal HTML | HTML document | Open locally in a browser to inspect the deck |
| WeChat | Standalone sanitized HTML | HTML document | Final appearance depends on the publishing editor |
| Mind map | Heading hierarchy JSON | Parseable JSON | Data model, not a rendered image |
| PNG | Bundled SVG/WASM renderer + Noto CJK font | PNG structure, dimensions, decoded pixels | 900 px wide; maximum 16,000 px; inline style fidelity is limited; no remote image loading |
| JPG | Same document renderer + local JPEG encoder | JPEG structure, dimensions, decoded pixels | Lossy quality 90; white background; same height/media limits as PNG |
| Card | Dedicated 1280×960 SVG layout → PNG | Exact dimensions and painted pixels | Designed summary; long body content is visibly shortened; light/dark themes |

## Runtime portability

The committed Skill bundles its JavaScript runtime, OCR worker, three Tesseract LSTM WASM variants, five compressed language models, `resvg.wasm`, and Noto Sans CJK SC/JP fonts. It requires Node.js 20 or newer but does not require Chrome, a system font, a conversion server, or a network connection.

PDF OCR uses the largest embedded raster scan on an image-only page. PDFs made only from vector paths without a text layer or embedded raster image are rejected instead of being silently misrepresented as successful OCR.
