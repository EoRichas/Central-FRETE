// Small, single-page PDF with a standard built-in font; no filesystem dependency.
export function licensePdf(lines: string[]): Uint8Array {
 const escape = (s: string) => s.replace(/[^\x20-\xFF]/g, " ").replace(/([\\()])/g, "\\$1");
 const content = "BT /F1 13 Tf 48 790 Td 22 TL " + lines.map((line, i) => `${i ? "T* " : ""}(${escape(line)}) Tj`).join("\n") + " ET";
 const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`];
 let result = "%PDF-1.4\n"; const offsets = [0];
 objects.forEach((object, i) => { offsets.push(Buffer.byteLength(result, "latin1")); result += `${i+1} 0 obj\n${object}\nendobj\n`; });
 const start = Buffer.byteLength(result, "latin1");
 result += `xref\n0 6\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10,"0")} 00000 n \n`).join("") + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return new Uint8Array(Buffer.from(result, "latin1"));
}
