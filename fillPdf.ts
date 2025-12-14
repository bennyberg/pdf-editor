import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";

/** Extend your FieldSpec with these RTL-related fields */
export type FieldSpec = {
  pageIndex: number;
  x: number;
  y: number;

  width?: number;
  height?: number;

  fontSize?: number;
  lineHeight?: number;

  align?: "left" | "center" | "right";
  maxFontSize?: number;
  minFontSize?: number;

  clearBackground?: boolean;

  /** "rtl" for Hebrew fields, "ltr" otherwise. "auto" tries to detect Hebrew. */
  direction?: "ltr" | "rtl" | "auto";
};

export type FieldMap = Record<string, FieldSpec>;

export type FillOptions = {
  /** Path to a .ttf/.otf font that supports Hebrew (required for Hebrew text). */
  fontPath?: string;

  defaultFontSize?: number;

  /** 0..1 floats */
  textColor?: { r: number; g: number; b: number };

  /** Auto-detect RTL if FieldSpec.direction is not set (default true). */
  autoDetectRtl?: boolean;

  /**
   * If true, for RTL fields with a width, defaults align to "right" when align is missing.
   * (default true)
   */
  defaultRtlAlignRight?: boolean;
};

/** Main function */
export async function fillFieldsToNewPdfBytes(
  inputPdfBytes: Uint8Array,
  fields: Record<string, string>,
  fieldMap: FieldMap,
  options: FillOptions = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(inputPdfBytes);

  // === Font setup ===
  let font: PDFFont;
  if (options.fontPath) {
    // Needed for embedding custom fonts (TTF/OTF)
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = await fs.readFile(options.fontPath);
    font = await pdfDoc.embedFont(fontBytes);
  } else {
    // Fine for Latin, NOT for Hebrew glyph coverage
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  // === Color ===
  const c = options.textColor ?? { r: 0, g: 0, b: 0 };
  const textColor = rgb(c.r, c.g, c.b);

  const autoDetectRtl = options.autoDetectRtl ?? true;
  const defaultRtlAlignRight = options.defaultRtlAlignRight ?? true;

  for (const [fieldName, rawValue] of Object.entries(fields)) {
    const spec = fieldMap[fieldName];
    if (!spec)
      throw new Error(`Unknown field "${fieldName}" (no mapping found).`);

    const page = pdfDoc.getPage(spec.pageIndex);

    // Decide direction
    const direction =
      spec.direction ??
      (autoDetectRtl && containsHebrew(rawValue) ? "rtl" : "ltr");

    // Default align for RTL fields if width exists and align not provided
    const align =
      spec.align ??
      (direction === "rtl" && defaultRtlAlignRight && spec.width
        ? "right"
        : "left");

    const baseFontSize = spec.fontSize ?? options.defaultFontSize ?? 12;

    // Convert text to what we will actually draw
    // (pdf-lib does not implement bidi layout)
    const rendered =
      direction === "rtl"
        ? rawValue // RTL behaves like old LTR (no visual reordering)
        : direction === "ltr" && containsHebrew(rawValue)
        ? rtlVisualize(rawValue) // LTR behaves like old RTL for Hebrew only
        : rawValue; // normal LTR for non-Hebrew text
    // Support multi-line values (manual newlines)
    const lines = rendered.split(/\r?\n/);

    // Fit font size to widest line (if width given)
    const fittedFontSize = fitFontSizeToWidth(font, lines, spec, baseFontSize);

    // Optional background clear (use provided height, else estimate)
    if (spec.clearBackground && (spec.width || spec.height)) {
      const bgWidth = spec.width ?? maxLineWidth(font, lines, fittedFontSize);
      const bgHeight =
        spec.height ??
        estimateBlockHeight(lines.length, fittedFontSize, spec.lineHeight);

      page.drawRectangle({
        x: spec.x,
        y: spec.y - bgHeight + fittedFontSize * 0.2, // small baseline tweak
        width: bgWidth,
        height: bgHeight,
        color: rgb(1, 1, 1),
        borderColor: rgb(1, 1, 1),
      });
    }

    // Draw each line; first line uses spec.y, next lines go down
    const lineHeight = spec.lineHeight ?? fittedFontSize * 1.2;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const y = spec.y - i * lineHeight;

      const lineWidth = font.widthOfTextAtSize(line, fittedFontSize);
      const x = computeAlignedX(spec.x, spec.width, align, lineWidth);

      page.drawText(line, {
        x,
        y,
        size: fittedFontSize,
        font,
        color: textColor,
      });
    }
  }

  return await pdfDoc.save();
}

/* =========================
 * Helpers
 * ========================= */

function containsHebrew(s: string) {
  // Hebrew block (including niqqud marks range)
  return /[\u0590-\u05FF]/.test(s);
}

/**
 * Practical RTL for Hebrew in PDFs:
 * - Split into runs: Hebrew, Latin/digits, and "other" punctuation/spaces
 * - Reverse the run order (RTL)
 * - Reverse graphemes inside Hebrew runs (keeps niqqud attached)
 * - Keep Latin/digits runs as-is (so 2025, ABC stay readable)
 *
 * This is not a full Unicode BiDi implementation, but works well for common form fields.
 */
function rtlVisualize(input: string) {
  // Fast path: if it's entirely Hebrew-ish (plus spaces/punct), just reverse graphemes
  if (/^[\u0590-\u05FF\s.,\-–—"'\(\)\[\]\/\\:;!?0-9]+$/.test(input)) {
    return reverseGraphemes(input);
  }

  const tokens = input.match(
    /[\u0590-\u05FF]+|[A-Za-z0-9]+|[^\u0590-\u05FFA-Za-z0-9]+/g
  );
  if (!tokens) return input;

  const processed = tokens.map((t) =>
    /[\u0590-\u05FF]/.test(t) ? reverseGraphemes(t) : t
  );

  return processed.reverse().join("");
}

function reverseGraphemes(s: string) {
  // Node 18+ usually supports Intl.Segmenter.
  // If not available, fall back to naive split (less correct for combining marks).
  const Seg = (Intl as any).Segmenter;
  if (!Seg) return s.split("").reverse().join("");

  const seg = new Seg("he", { granularity: "grapheme" });
  const parts = Array.from(seg.segment(s), (x: any) => x.segment);
  return parts.reverse().join("");
}

function computeAlignedX(
  x: number,
  width: number | undefined,
  align: "left" | "center" | "right",
  textWidth: number
) {
  if (!width || align === "left") return x;
  if (align === "center") return x + (width - textWidth) / 2;
  return x + (width - textWidth);
}

function fitFontSizeToWidth(
  font: PDFFont,
  lines: string[],
  spec: FieldSpec,
  fallback: number
) {
  if (!spec.width) return fallback;

  const maxSize = spec.maxFontSize ?? fallback;
  const minSize = spec.minFontSize ?? 6;

  let size = maxSize;
  while (size > minSize) {
    const widest = maxLineWidth(font, lines, size);
    if (widest <= spec.width) return size;
    size -= 0.5;
  }
  return minSize;
}

function maxLineWidth(font: PDFFont, lines: string[], fontSize: number) {
  let max = 0;
  for (const line of lines) {
    const w = font.widthOfTextAtSize(line, fontSize);
    if (w > max) max = w;
  }
  return max;
}

function estimateBlockHeight(
  lineCount: number,
  fontSize: number,
  lineHeight?: number
) {
  const lh = lineHeight ?? fontSize * 1.2;
  return Math.max(fontSize * 1.35, (lineCount - 1) * lh + fontSize * 1.35);
}

/**
 * Convenience wrapper: read template from disk, fill it, write output to disk.
 * This matches the API you used in example.ts.
 */
export async function fillFieldsInPlace(
  inputPath: string,
  fields: Record<string, string>,
  fieldMap: FieldMap,
  outputPath: string,
  options: FillOptions = {}
) {
  const inputBytes = await fs.readFile(inputPath);
  const outBytes = await fillFieldsToNewPdfBytes(
    inputBytes,
    fields,
    fieldMap,
    options
  );
  await fs.writeFile(outputPath, outBytes);
}
