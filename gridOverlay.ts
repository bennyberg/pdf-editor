import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "node:fs/promises";

/**
 * Draws a debug grid onto every page of a PDF.
 *
 * Coordinates are in PDF points:
 * - origin (0,0) is bottom-left
 * - 1 point = 1/72 inch
 */
async function addGridOverlayToPdf(inputPath: string, outputPath: string) {
  const inputBytes = await fs.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(inputBytes);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // === Grid settings ===
  const minorStep = 10;   // points between light lines (e.g., 25)
  const majorStep = 50;  // points between darker lines (e.g., 100)
  const labelEveryMajor = true;

  const minorColor = rgb(0.85, 0.85, 0.85);
  const majorColor = rgb(0.65, 0.65, 0.65);
  const axisColor = rgb(0.2, 0.2, 0.2);

  const minorThickness = 0.5;
  const majorThickness = 1.0;
  const axisThickness = 1.5;

  const labelSize = 8;
  const labelPadding = 2;

  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();

    // Draw axes (x=0 and y=0)
    page.drawLine({
      start: { x: 0, y: 0 },
      end: { x: width, y: 0 },
      color: axisColor,
      thickness: axisThickness,
    });
    page.drawLine({
      start: { x: 0, y: 0 },
      end: { x: 0, y: height },
      color: axisColor,
      thickness: axisThickness,
    });

    // Vertical lines
    for (let x = 0; x <= width; x += minorStep) {
      const isMajor = x % majorStep === 0;
      page.drawLine({
        start: { x, y: 0 },
        end: { x, y: height },
        color: isMajor ? majorColor : minorColor,
        thickness: isMajor ? majorThickness : minorThickness,
      });

      if (labelEveryMajor && isMajor) {
        const text = `x=${x}`;
        page.drawText(text, {
          x: x + labelPadding,
          y: labelPadding,
          size: labelSize,
          font,
          color: axisColor,
        });
      }
    }

    // Horizontal lines
    for (let y = 0; y <= height; y += minorStep) {
      const isMajor = y % majorStep === 0;
      page.drawLine({
        start: { x: 0, y },
        end: { x: width, y },
        color: isMajor ? majorColor : minorColor,
        thickness: isMajor ? majorThickness : minorThickness,
      });

      if (labelEveryMajor && isMajor) {
        const text = `y=${y}`;
        page.drawText(text, {
          x: labelPadding,
          y: y + labelPadding,
          size: labelSize,
          font,
          color: axisColor,
        });
      }
    }

    // Page label
    page.drawText(`page=${i}`, {
      x: width - 60,
      y: height - 14,
      size: 10,
      font,
      color: axisColor,
    });
  }

  const outBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, outBytes);
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath || !outputPath) {
    console.error("Usage: node --loader ts-node/esm gridOverlay.ts <input.pdf> <output.pdf>");
    process.exit(1);
  }

  await addGridOverlayToPdf(inputPath, outputPath);
  console.log(`Wrote gridded PDF to: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
