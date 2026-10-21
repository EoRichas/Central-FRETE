import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { FleetClientReport } from '@/lib/domain/fleet-client-report';
import { formatDate, formatMoney } from '@/lib/format';

export type ClientReportObservation = {saleId: string; text: string};
const W = 595.28, H = 841.89, M = 30, WIDTH = W - 2 * M;
const navy = rgb(.035, .09, .29), ink = rgb(.09, .14, .23), muted = rgb(.37, .44, .54), pale = rgb(.94, .96, .98), white = rgb(1, 1, 1), line = rgb(.83, .87, .93);

/** Customer document: no cost, commission, margin or internal identity is exported. */
export async function renderFleetClientPdf(report: FleetClientReport, observations: ClientReportObservation[]) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const [regularBytes, boldBytes, logoBytes] = await Promise.all([
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
    readFile(path.join(process.cwd(), 'public/central-express-logo.png')),
  ]);
  const regular = await doc.embedFont(regularBytes, {subset: true}), bold = await doc.embedFont(boldBytes, {subset: true}), logo = await doc.embedPng(logoBytes);
  const charset = new Set(regular.getCharacterSet());
  const safe = (s: string) => [...s.normalize('NFC').replace(/[\u0000-\u0008\u000b-\u001f]/g, '')].map(c => c === '\n' || charset.has(c.codePointAt(0)!) ? c : '?').join('');
  const wrap = (value: string, width: number, size = 7) => {
    const out: string[] = [];
    for (const paragraph of safe(value).split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (regular.widthOfTextAtSize(next, size) <= width) { current = next; continue; }
        if (current) out.push(current); current = '';
        for (const char of word) {
          if (regular.widthOfTextAtSize(current + char, size) > width) { out.push(current); current = ''; }
          current += char;
        }
      }
      out.push(current);
    }
    return out;
  };
  let page!: PDFPage, y = 0;
  const text = (s: string, x: number, yy: number, size = 8, strong = false, color = ink) => page.drawText(safe(s), {x, y: yy, size, font: strong ? bold : regular, color});
  const rect = (x: number, yy: number, w: number, h: number, color = pale) => page.drawRectangle({x, y: yy, width: w, height: h, color});
  const newPage = () => {
    page = doc.addPage([W, H]);
    rect(0, H - 126, W, 126, navy); rect(M, H - 100, 3, 75, rgb(.8, .12, .16));
    text('CENTRAL EXPRESS', M + 14, H - 38, 19, true, white);
    text('TRANSPORTE DE VEÍCULOS', M + 14, H - 57, 9, true, white);
    text('RELATÓRIO DE VENDAS POR CLIENTE', M + 14, H - 93, 11, true, white);
    const logoSize = logo.scale(Math.min(89 / logo.width, 80 / logo.height));
    page.drawImage(logo, {x: W - M - logoSize.width, y: H - 107, ...logoSize});
    y = H - 148;
    const names = wrap(`CLIENTE: ${report.client.name}`, WIDTH - 20, 9);
    const height = names.length * 13 + 16; rect(M, y - height, WIDTH, height);
    names.forEach((name, i) => text(name, M + 10, y - 16 - i * 13, 9, true)); y -= height + 20;
    text(`PERÍODO: ${formatDate(report.from)} a ${formatDate(report.to)}`, M, y, 8);
    text(`EMISSÃO: ${new Date().toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`, W - M - 115, y, 8);
    y -= 17;
  };
  const ensure = (height: number) => { if (y - height < 50) newPage(); };
  const paragraph = (s: string, strong = false, size = 8) => {
    for (const row of wrap(s, WIDTH, size)) { ensure(14); text(row, M, y, size, strong); y -= 13; }
    y -= 5;
  };
  newPage();
  const kpis = [['VEÍCULOS TRANSPORTADOS', String(report.totals.vehicles)], ['TOTAL DOS SERVIÇOS', formatMoney(report.totals.amountCents)], ['TOTAL RECEBIDO', formatMoney(report.totals.receivedCents)]];
  const cardWidth = (WIDTH - 16) / 3;
  kpis.forEach(([label, value], i) => { const x = M + i * (cardWidth + 8); rect(x, y - 53, cardWidth, 53); text(label, x + 9, y - 15, 6.5, true, muted); text(value, x + 9, y - 37, 13, true, navy); });
  y -= 76; paragraph('DETALHAMENTO DOS SERVIÇOS', true, 10);
  // Paired date labels retain legibility in the portrait model without shrinking
  // nine independent columns below a useful reading size.
  const columns = [
    {label: 'VENDA / CRIAÇÃO', width: 57}, {label: 'VEÍCULO / PLACA', width: 100},
    {label: 'SITUAÇÃO', width: 74}, {label: 'VALOR (R$)', width: 66},
    {label: 'RECEBIMENTO (R$)', width: 70}, {label: 'DATAS', width: 122}, {label: 'PAGO', width: WIDTH - 489},
  ];
  const heading = () => {
    ensure(70); rect(M, y - 32, WIDTH, 32, navy); let x = M;
    columns.forEach(c => { wrap(c.label, c.width - 10, 6.5).forEach((s, i) => text(s, x + 5, y - 13 - i * 9, 6.5, true, white)); x += c.width; }); y -= 32;
  };
  heading();
  for (const [index, row] of report.rows.entries()) {
    const vehicles = row.vehicles.map(v => `${v.model || 'Veículo não informado'}\n${v.plate || v.identification || 'Placa não informada'}`).join('\n');
    const cells = [`${row.saleNumber}\n${formatDate(row.createdDate)}`, vehicles || 'Não informado', row.situation, formatMoney(row.amountCents), formatMoney(row.receivedCents),
      `Recebimento: ${row.receivedDates.length ? row.receivedDates.map(d => formatDate(d)).join(', ') : 'Não informado'}\nSaída (coleta): ${row.departureDate ? formatDate(row.departureDate) : 'Não informada'}`, row.paid];
    const lines = cells.map((cell, i) => wrap(cell, columns[i].width - 10, 7));
    let offset = 0; const count = Math.max(...lines.map(l => l.length));
    while (offset < count) {
      if (y < 85) { newPage(); heading(); }
      const capacity = Math.max(1, Math.floor((y - 59) / 10)), n = Math.min(capacity, count - offset), height = Math.max(32, n * 10 + 12);
      if (y - height < 50) { newPage(); heading(); continue; }
      if (index % 2 === 0) rect(M, y - height, WIDTH, height);
      let x = M;
      columns.forEach((c, i) => { lines[i].slice(offset, offset + n).forEach((s, j) => text(s, x + 5, y - 13 - j * 10, 7)); x += c.width; });
      y -= height; page.drawLine({start: {x: M, y}, end: {x: W - M, y}, color: line, thickness: .5}); offset += n;
    }
  }
  ensure(45); rect(M, y - 31, WIDTH, 31); text('TOTAL DO PERÍODO', M + 10, y - 20, 9, true, navy); text(formatMoney(report.totals.amountCents), W - M - 110, y - 20, 10, true, navy); y -= 57;
  paragraph('RESUMO FINANCEIRO', true, 10);
  ensure(30); text(`Valor total: ${formatMoney(report.totals.amountCents)}`, M, y, 8);
  text(`Valor pendente: ${formatMoney(report.totals.balanceCents)}`, M + WIDTH / 2, y, 8); y -= 23;
  for (const observation of observations) {
    const row = report.rows.find(r => r.id === observation.saleId);
    if (!row) continue;
    ensure(55);
    if (observation === observations[0]) paragraph('OBSERVAÇÕES', true, 10);
    paragraph(`Venda ${row.saleNumber} - ${row.vehicles.map(v => v.plate || v.model).join(', ')}`, true);
    paragraph(observation.text);
  }
  ensure(50); paragraph('Período pela criação da venda. Recebimento conforme baixas e pagamentos confirmados, descontados os estornos. Datas não cadastradas são indicadas como não informadas.', false, 7);
  doc.getPages().forEach((p, i, pages) => {
    page = p; page.drawLine({start: {x: M, y: 39}, end: {x: W - M, y: 39}, color: line, thickness: .6});
    text('CENTRAL EXPRESS | TRANSPORTE DE VEÍCULOS', M, 25, 7, true, navy);
    text(`Página ${i + 1} de ${pages.length}`, W - M - 70, 25, 7, false, muted);
  });
  doc.setTitle(`Relatório de vendas - ${report.client.name}`); doc.setAuthor('Central Express');
  return doc.save();
}
