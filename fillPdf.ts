// fillPdf.ts
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { FieldMap, FieldSpec } from "./fieldMap.ts";

type FillOptions = {
  fontPath?: string;         // optional custom TTF
  defaultFontSize?: number;
  textColor?: { r: number; g: number; b: number };
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function computeX(spec: FieldSpec, textWidth: number) {
  const width = spec.width ?? 0;
  const align = spec.align ?? "left";
  if (!width || align === "left") return spec.x;
  if (align === "center") return spec.x + (width - textWidth) / 2;
  return spec.x + (width - textWidth);
}

/**
 * Simple auto-fit: shrink font size until text fits spec.width (if provided).
 */
function fitFontSize(font: any, text: string, spec: FieldSpec, fallbackSize: number) {
  const width = spec.width;
  if (!width) return fallbackSize;

  const maxSize = spec.maxFontSize ?? fallbackSize;
  const minSize = spec.minFontSize ?? 6;

  let size = maxSize;
  while (size > minSize) {
    const w = font.widthOfTextAtSize(text, size);
    if (w <= width) return size;
    size -= 0.5;
  }
  return minSize;
}

export async function fillFieldsToNewPdfBytes(
  inputPdfBytes: Uint8Array,
  fields: Record<string, string>,
  fieldMap: FieldMap,
  options: FillOptions = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(inputPdfBytes);

  // Font: either custom TTF or a standard one
  let font;
  if (options.fontPath) {
    const fontBytes = await fs.readFile(options.fontPath);
    font = await pdfDoc.embedFont(fontBytes);
  } else {
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  const color = options.textColor ?? { r: 0, g: 0, b: 0 };
  const textRgb = rgb(color.r, color.g, color.b);

  for (const [fieldName, value] of Object.entries(fields)) {
    const spec = fieldMap[fieldName];
    if (!spec) {
      throw new Error(`Unknown field "${fieldName}" (no mapping found).`);
    }

    const page = pdfDoc.getPage(spec.pageIndex);

    const baseFontSize = spec.fontSize ?? options.defaultFontSize ?? 12;
    const fontSize = fitFontSize(font, value, spec, baseFontSize);

    // Optionally clear the area first (useful if template has faint pre-filled text)
    if (spec.clearBackground && (spec.width || spec.height)) {
      page.drawRectangle({
        x: spec.x,
        y: spec.y - (spec.height ?? fontSize * 1.2),
        width: spec.width ?? font.widthOfTextAtSize(value, fontSize),
        height: spec.height ?? fontSize * 1.35,
        color: rgb(1, 1, 1),
        borderColor: rgb(1, 1, 1),
      });
    }

    const textWidth = font.widthOfTextAtSize(value, fontSize);
    const x = computeX(spec, textWidth);

    page.drawText(value, {
      x,
      y: spec.y,
      size: fontSize,
      font,
      color: textRgb,
      lineHeight: spec.lineHeight,
    });
  }

  return await pdfDoc.save();
}

/**
 * Your “duplicate then replace” workflow, done safely:
 * - write result to a temp file
 * - then rename into place (atomic on most OSes)
 */
export async function fillFieldsInPlace(
  inputPdfPath: string,
  fields: Record<string, string>,
  fieldMap: FieldMap,
  outputPdfPath?: string,
  options: FillOptions = {}
) {
  const inBytes = await fs.readFile(inputPdfPath);
  const outBytes = await fillFieldsToNewPdfBytes(inBytes, fields, fieldMap, options);

  const targetPath = outputPdfPath ?? inputPdfPath;

await fs.mkdir(path.dirname(targetPath), { recursive: true });

const tmpPath = path.join(
  path.dirname(targetPath),
  `.${path.basename(targetPath)}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

await fs.writeFile(tmpPath, outBytes);
await fs.rename(tmpPath, targetPath);}
