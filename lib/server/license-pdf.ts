import { shiftMonth, validCompetency } from "@/lib/domain/billing";
import { licenseLogo } from "@/lib/server/license-logo";

export type LicenseCertificate = {
 companyName: string;
 companyCnpj?: string;
 competency: string;
 approvedAt: string | null;
 licenseKey: string | null;
 gracePeriod?: boolean;
 status: "active" | "historical" | "blocked";
 issuedAt?: Date;
 preview?: boolean;
};

export const LICENSE_HOLDER = {
 name: "Central Express Transportes LTDA",
 cnpj: "33.958.561/0001-57",
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const colors = {
 navy: "0.043 0.149 0.220", red: "0.761 0.247 0.255", ink: "0.075 0.157 0.231",
 muted: "0.322 0.392 0.467", line: "0.859 0.894 0.922", pale: "0.949 0.965 0.973",
 white: "1 1 1",
};
const escapeText = (value: string) => value.normalize("NFC").replace(/[^\x20-\xFF]/g, " ").replace(/([\\()])/g, "\\$1");
const shortDate = (iso: string) => iso.split("-").reverse().join("/");
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

function paymentDate(approvedAt: string | null) {
 if (!approvedAt) return "Confirmado no sistema";
 // Preserve a date-only value; timestamps are displayed in the billing timezone.
 if (/^\d{4}-\d{2}-\d{2}$/.test(approvedAt)) return shortDate(approvedAt);
 const date = new Date(approvedAt);
 return Number.isNaN(date.getTime()) ? "Confirmado no sistema" : dateFormatter.format(date);
}

/** One-page A4 certificate. Standard PDF fonts avoid external services and filesystem dependencies. */
export function licensePdf(data: LicenseCertificate): Uint8Array {
 if (!validCompetency(data.competency)) throw new Error("Competência inválida.");
 const issuedAt = data.issuedAt ?? new Date();
 const nextMonth = shiftMonth(data.competency, 1);
 const validUntil = new Date(nextMonth + "-05T12:00:00Z");
 validUntil.setUTCDate(validUntil.getUTCDate() - 1);
 const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(data.competency + "-05T12:00:00Z"));
 const competency = monthName.charAt(0).toUpperCase() + monthName.slice(1);
 const content: string[] = [];
 const rect = (x: number, top: number, width: number, height: number, color: string) => content.push(color + " rg " + x + " " + (PAGE_HEIGHT-top-height) + " " + width + " " + height + " re f");
 const line = (x: number, top: number, width: number) => content.push(colors.line + " RG 0.7 w " + x + " " + (PAGE_HEIGHT-top) + " m " + (x+width) + " " + (PAGE_HEIGHT-top) + " l S");
 const text = (value: string, x: number, baseline: number, size = 11, font = "F1", color = colors.ink) => content.push("BT /" + font + " " + size + " Tf " + color + " rg 1 0 0 1 " + x + " " + (PAGE_HEIGHT-baseline) + " Tm (" + escapeText(value) + ") Tj ET");
 const label = (value: string, x: number, baseline: number) => text(value, x, baseline, 8, "F2", colors.muted);

 rect(0, 0, PAGE_WIDTH, 8, colors.navy);
 const logoWidth = Math.min(76, 72 * licenseLogo.width / licenseLogo.height);
 const logoHeight = logoWidth * licenseLogo.height / licenseLogo.width;
 content.push(`q ${logoWidth} 0 0 ${logoHeight} 44 ${PAGE_HEIGHT-18-logoHeight} cm /Logo Do Q`);
 text("CENTRAL FRETE", 128, 53, 13, "F2", colors.navy);
 text("Gestão de fretes e frota", 128, 70, 9, "F1", colors.muted);
 if (data.preview) {
  rect(352, 44, 199, 24, colors.pale);
  text("PRÉVIA DO CERTIFICADO", 365, 60, 9, "F2", colors.muted);
 } else {
  label("LICENCIAMENTO MENSAL", 415, 58);
 }
 line(44, 94, 507);

 text("Certificado digital", 44, 143, 31, "F2", colors.navy);
 text("Licença de uso mensal do sistema", 45, 165, 12, "F1", colors.muted);
 text("Pagamento concluído", 44, 203, 12, "F2", colors.navy);
 if (data.gracePeriod) text("Carência inicial | Mensalidade dispensada", 44, 222, 10, "F1", colors.muted);
 text(competency, 44, 242, 13, "F2", colors.ink);
 text(data.gracePeriod ? "Licença liberada durante o período de carência da empresa abaixo." : "Registro do pagamento e do período de licença da empresa abaixo.", 44, 262, 10, "F1", colors.muted);

 rect(44, 282, 507, 88, colors.pale);
 label("TITULAR DA LICENÇA", 62, 302);
 const company = data.companyName.replace(/\s+/g, " ").trim().slice(0, 90);
 const companyLines = company.length <= 45 ? [company] : company.match(/.{1,45}/g) ?? ["Empresa"];
 const companySize = company.length <= 35 ? 16 : 10;
 companyLines.forEach((value, index) => text(value.trim(), 62, 325 + index*15, companySize, "F2", colors.navy));
 if (data.companyCnpj) text(`CNPJ: ${data.companyCnpj}`, 62, 346 + (companyLines.length-1)*15, 11, "F1", colors.muted);

 if (data.gracePeriod) {
  label("MODALIDADE", 44, 404);
  text("Carência inicial", 44, 433, 18, "F2", colors.navy);
  label("PERÍODO DE REFERÊNCIA", 310, 404);
  text(competency, 310, 433, 17, "F2", colors.navy);
 } else {
  label("PAGAMENTO CONFIRMADO EM", 44, 404);
  const paidOn = paymentDate(data.approvedAt);
  text(paidOn, 44, 433, paidOn.length === 10 ? 21 : 14, "F2", colors.navy);
  label("INÍCIO DA VIGÊNCIA", 310, 404);
  text(shortDate(data.competency + "-05"), 310, 433, 21, "F2", colors.navy);
 }
 line(44, 457, 507);

 label("LICENÇA VÁLIDA ATÉ", 44, 483);
 text(shortDate(validUntil.toISOString().slice(0, 10)), 44, 512, 21, "F2", colors.navy);
 label("PRÓXIMO VENCIMENTO", 310, 483);
 text(shortDate(nextMonth + "-05"), 310, 512, 21, "F2", colors.red);
 text("A nova competência começa no dia 05 de cada mês.", 44, 543, 9, "F1", colors.muted);

 rect(44, 569, 507, 93, colors.navy);
 text(data.gracePeriod ? "LIBERAÇÃO EM CARÊNCIA" : "CHAVE DA LICENÇA", 62, 592, 8, "F2", "0.60 0.85 0.89");
 // Generated keys contain 48 hex characters; preserve the exact key for copying.
 text(data.gracePeriod ? "Acesso liberado durante o período inicial." : data.licenseKey ?? "", 62, 616, 11, data.gracePeriod ? "F1" : "F3", colors.white);
 text(data.gracePeriod ? "A renovação mensal começa após o término da carência." : "Identificador exclusivo desta competência.", 62, 642, 9, "F1", "0.78 0.84 0.88");

 const status = data.status === "blocked" ? "Acesso suspenso por pendência na data de emissão." : data.status === "historical" ? "Certificado histórico de uma competência encerrada." : "Licença vigente na data de emissão.";
 text(status, 44, 691, 10, "F2", colors.ink);
 text("Consulte a aba Certificado digital para verificar a situação atual da licença.", 44, 711, 9, "F1", colors.muted);
 line(44, 752, 507);
 text(data.preview ? "Prévia para conferência do documento." : "Documento emitido eletronicamente pelo sistema Central Frete.", 44, 773, 8, "F1", colors.muted);
 text("Emissão: " + dateFormatter.format(issuedAt) + " | Horário de Brasília", 44, 790, 8, "F1", colors.muted);
 text("01 / 01", 520, 790, 8, "F1", colors.muted);

 const stream = content.join("\n");
 const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PAGE_WIDTH + " " + PAGE_HEIGHT + "] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> /XObject << /Logo 9 0 R >> >> /Contents 7 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  "<< /Length " + Buffer.byteLength(stream, "latin1") + " >>\nstream\n" + stream + "\nendstream",
  "<< /Title (Certificado digital - Central Frete - " + data.competency + ") /Author (Central Frete) /Subject (Licença de uso mensal) >>",
  "<< /Type /XObject /Subtype /Image /Width " + licenseLogo.width + " /Height " + licenseLogo.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + licenseLogo.data.length + " >>\nstream\n" + licenseLogo.data.toString("latin1") + "\nendstream",
 ];
 let result = "%PDF-1.4\n";
 const offsets = [0];
 objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(result, "latin1"));
  result += (index+1) + " 0 obj\n" + object + "\nendobj\n";
 });
 const start = Buffer.byteLength(result, "latin1");
 result += "xref\n0 " + (objects.length+1) + "\n0000000000 65535 f \n" + offsets.slice(1).map(n => String(n).padStart(10,"0") + " 00000 n \n").join("") + "trailer\n<< /Size " + (objects.length+1) + " /Root 1 0 R /Info 8 0 R >>\nstartxref\n" + start + "\n%%EOF";
 return new Uint8Array(Buffer.from(result, "latin1"));
}
