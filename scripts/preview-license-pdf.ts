import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { licensePdf } from "../lib/server/license-pdf.ts";

// Uses the production renderer with example data, without database or payment calls.
const output = resolve(process.argv[2] ?? "output/pdf/previa-certificado-central-frete.pdf");
const document = licensePdf({
 companyName: "Central Frete",
 competency: "2026-10",
 approvedAt: "2026-09-30T15:42:00-03:00",
 licenseKey: "0123456789abcdef".repeat(3),
 status: "active",
 issuedAt: new Date("2026-10-05T09:00:00-03:00"),
 preview: true,
});
await mkdir(dirname(output), { recursive: true });
await writeFile(output, document);
console.log(output);
