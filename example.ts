// example.ts
import { fillFieldsInPlace } from "./fillPdf.ts";
import { fieldMap } from "./fieldMap.ts";

async function main() {
  await fillFieldsInPlace(
    "template.pdf",
    {
      // fullName: "John Doe",
      // idNumber: "123456789",
      // address: "10 Main St, Jerusalem",

      // "firstName": { pageIndex: 0, x: 337.5, y: 639.42, fontSize: 12, clearBackground: false },
      // "idNumber": { pageIndex: 0, x: 341.25, y: 593.17, fontSize: 12, clearBackground: false},
      // "lastName": { pageIndex: 0, x: 338.75, y: 616.92, fontSize: 12, clearBackground: false },

      firstName: "John",
      lastName: "Doe",
      idNumber: "123123123",
    },
    fieldMap,
    "output.pdf"
  );
}

main().catch(console.error);
