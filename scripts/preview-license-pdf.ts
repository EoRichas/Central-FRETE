import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { LICENSE_HOLDER, licensePdf } from "../lib/server/license-pdf.ts";

// Uses the production renderer with example data, without database or payment calls.
const output = resolve(process.argv[2] ?? "output/pdf/previa-certificado-central-frete.pdf");
const document = licensePdf({
 companyName: LICENSE_HOLDER.name,
 companyCnpj: LICENSE_HOLDER.cnpj,
 competency: "2026-09",
 approvedAt: null,
 licenseKey: null,
 gracePeriod: true,
 status: "active",
 issuedAt: new Date("2026-09-09T09:00:00-03:00"),
 preview: true,
});
await mkdir(dirname(output), { recursive: true });
await writeFile(output, document);
console.log(output);
