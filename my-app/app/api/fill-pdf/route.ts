import path from "node:path";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import { fieldMap } from "@/pdf/fieldMap";          // generated from fieldMap.partial.json
import { fillFieldsToNewPdfBytes } from "@/pdf/fillPdf";

export const runtime = "nodejs"; // important: uses fs

export async function POST(req: Request) {
  const fields = (await req.json()) as Record<string, string>;

  // Load template + font from your project (example.ts does the same idea) :contentReference[oaicite:5]{index=5}
  const templatePath = path.join(process.cwd(), "public", "templates", "template.pdf");
  const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansHebrew-Regular.ttf");

  const templateBytes = await fs.readFile(templatePath);

  const outBytes = await fillFieldsToNewPdfBytes(templateBytes, fields, fieldMap, {
    fontPath,
    // optional knobs exist in fillPdf.ts :contentReference[oaicite:6]{index=6}
    // autoDetectRtl: true,
    // defaultRtlAlignRight: true,
  });

  const body = Buffer.from(outBytes);

//   const body = outBytes.buffer.slice(
//     outBytes.byteOffset,
//     outBytes.byteOffset + outBytes.byteLength
//   );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="filled.pdf"',
    },
  });
}

// async function onSubmit(values: Record<string, string>) {
//   const res = await fetch("/api/fill-pdf", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(values),
//   });   

//   if (!res.ok) throw new Error("PDF generation failed");

//   const blob = await res.blob();
//   const url = URL.createObjectURL(blob);

//   const a = document.createElement("a");
//   a.href = url;
//   a.download = "filled.pdf";
//   a.click();

//   URL.revokeObjectURL(url);
// }

