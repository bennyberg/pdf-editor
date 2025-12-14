// example.ts
import { fillFieldsInPlace } from "./fillPdf.ts";
import { fieldMap } from "./fieldMap.ts";

async function main() {
  await fillFieldsInPlace(
    "template.pdf",
    {
      fullName: "John Doe",
      // idNumber: "123456789",
      // address: "10 Main St, Jerusalem",
    },
    fieldMap,
    "output.pdf"
  );
}

main().catch(console.error);