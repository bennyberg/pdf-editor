// example.ts
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fillFieldsInPlace } from "./fillPdf.ts";
import { fieldMap } from "./fieldMap.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve files relative to this script's directory (robust)
const templatePath = path.join(__dirname, "template.pdf");
const outputPath = path.join(__dirname, "output.pdf");
const fontPath = path.join(__dirname, "assets", "fonts", "NotoSansHebrew-Regular.ttf");

async function main() {
  await fillFieldsInPlace(
    templatePath,
    {
      firstName: "יוסי",
      lastName: "יוסי",
      idNumber: "123123123",
    },
    fieldMap,
    outputPath,
    {
      fontPath, // Hebrew-capable font
      // optional:
      // autoDetectRtl: true,
      // defaultRtlAlignRight: true,
      // textColor: { r: 0, g: 0, b: 0 },
    }
  );

  console.log("Wrote:", outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
