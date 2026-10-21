import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { FleetClientReport } from '@/lib/domain/fleet-client-report';
import { formatDate, formatMoney } from '@/lib/format';

export type ClientReportObservation = {saleId: string; text: string};
const W = 841.89, H = 595.28, M = 28, WIDTH = W - 2 * M;
const navy = rgb(.035, .09, .29), ink = rgb(.09, .14, .23), muted = rgb(.37, .44, .54), pale = rgb(.94, .96, .98), white = rgb(1, 1, 1), line = rgb(.83, .87, .93);
const green = rgb(.09, .4, .28), amber = rgb(.6, .36, .08);

/** Customer relation: no cost, commission, margin or internal identity is exported. */
export async function renderFleetClientPdf(report: FleetClientReport, observations: ClientReportObservation[], orderNumber?: string) {
  const notes = new Map(observations.map(item => [item.saleId, item.text]));
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const [regularBytes, boldBytes, logoBytes] = await Promise.all([
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
    readFile(path.join(process.cwd(), 'public/central-express-logo.png')),
  ]);
  const regular = await doc.embedFont(regularBytes, {subset: true}), bold = await doc.embedFont(boldBytes, {subset: true}), logo = await doc.embedPng(logoBytes);
  const charset = new Set(regular.getCharacterSet());
  const safe = (s: string) => [...s.normalize('NFC').replace(/[\u0000-\u0008\u000b-\u001f]/g, '')].map(c => c === '\n' || charset.has(c.codePointAt(0)!) ? c : '?').join('');
  const wrap = (value: string, width: number, size = 7.3, strong = false) => {
    const font = strong ? bold : regular, out: string[] = [];
    for (const paragraph of safe(value).split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { current = next; continue; }
        if (current) out.push(current); current = '';
        for (const char of word) {
          if (font.widthOfTextAtSize(current + char, size) > width) { out.push(current); current = ''; }
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
    rect(0, H - 108, W, 108, navy); rect(M, H - 82, 3, 59, rgb(.8, .12, .16));
    text('CENTRAL EXPRESS', M + 15, H - 38, 19, true, white);
    text('TRANSPORTE DE VEÍCULOS', M + 15, H - 54, 8, false, white);
    text(orderNumber ? `OS ${orderNumber} | RELAÇÃO DE SERVIÇOS` : 'OS | RELAÇÃO DE SERVIÇOS', M + 15, H - 81, 11, true, white);
    const logoSize = logo.scale(Math.min(88 / logo.width, 77 / logo.height));
    page.drawImage(logo, {x: W - M - logoSize.width, y: H - 92, ...logoSize});
    y = H - 133;
    const names = wrap(`CLIENTE: ${report.client.name}`, WIDTH, 9, true);
    names.forEach((name, i) => text(name, M, y - i * 13, 9, true)); y -= (names.length - 1) * 13 + 20;
    text(`PERÍODO DE CRIAÇÃO: ${formatDate(report.from)} a ${formatDate(report.to)}`, M, y, 8, false, muted);
    const issued = `EMISSÃO: ${new Date().toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`;
    text(issued, W - M - regular.widthOfTextAtSize(issued, 8), y, 8, false, muted);
    y -= 20;
  };
  const columns = [
    {label: 'DATA', width: 64}, {label: 'MOTORISTA', width: 73}, {label: 'CLIENTE', width: 81},
    {label: 'VEÍCULO', width: 84}, {label: 'PLACA', width: 63}, {label: 'SITUAÇÃO', width: 72},
    {label: 'CLIENTE / OBSERVAÇÃO', width: 139}, {label: 'VALOR\nSERVIÇO', width: 85},
    {label: 'CONFIRMAÇÃO\nDO PAGAMENTO', width: WIDTH - 661},
  ];
  const heading = () => {
    rect(M, y - 38, WIDTH, 38, navy); let x = M;
    columns.forEach(c => { wrap(c.label, c.width - 15, 6.8, true).forEach((s, i) => text(s, x + 8, y - 15 - i * 9, 6.8, true, white)); x += c.width; }); y -= 38;
  };
  newPage(); heading();
  for (const [index, row] of report.rows.entries()) {
    const models = row.vehicles.map(v => v.model || 'Não informado').join('\n');
    const plates = row.vehicles.map(v => v.plate || v.identification || 'Não informada').join('\n');
    const payment = row.paid === 'Sim' ? 'CONFIRMADO' : row.paid === 'Parcial' ? 'PARCIAL' : 'PENDENTE';
    const confirmation = `${payment}\n${row.receivedDates.length ? row.receivedDates.map(d => formatDate(d)).join(', ') : 'Data não informada'}\n${formatMoney(row.receivedCents)}`;
    // Only explicitly selected observations enter a customer document.
    const cells = [formatDate(row.createdDate), row.driverName || 'Não informado', row.clientName,
      models || 'Não informado', plates || 'Não informada', row.serviceSituation || 'Não informada',
      `${row.clientName}\n${notes.get(row.id) || 'Sem observação incluída.'}`, formatMoney(row.amountCents), confirmation];
    const lines = cells.map((cell, i) => wrap(cell, columns[i].width - 15, 7.3, i === 7));
    const count = Math.max(...lines.map(l => l.length));
    // Move normal rows intact. Extremely long notes continue with repeated headings.
    const rowHeight = Math.max(68, count * 11 + 22);
    const freshTop = H - 173 - (wrap(`CLIENTE: ${report.client.name}`, WIDTH, 9, true).length - 1) * 13 - 38;
    if (y - rowHeight < 57 && rowHeight <= freshTop - 57) { newPage(); heading(); }
    let offset = 0;
    while (offset < count) {
      if (y < 125) { newPage(); heading(); }
      const capacity = Math.max(1, Math.floor((y - 57 - 22) / 11));
      const n = Math.min(capacity, count - offset), height = Math.max(68, n * 11 + 22);
      if (y - height < 57) { newPage(); heading(); continue; }
      if (index % 2 === 0) rect(M, y - height, WIDTH, height);
      let x = M;
      columns.forEach((c, i) => {
        const visible = lines[i].slice(offset, offset + n);
        // Repeat available context when a selected note spans multiple pages.
        if (!visible.length && offset > 0 && i !== 6) visible.push(...lines[i].slice(0, n));
        visible.forEach((s, j) => {
          const strong = i === 7, color = i === 8 && offset + j === 0 ? (row.paid === 'Sim' ? green : amber) : ink;
          const xx = i === 7 ? x + c.width - 7 - bold.widthOfTextAtSize(s, 7.3) : x + 8;
          text(s, xx, y - 21 - j * 11, 7.3, strong, color);
        }); x += c.width;
      });
      y -= height; page.drawLine({start: {x: M, y}, end: {x: W - M, y}, color: line, thickness: .5}); offset += n;
    }
  }
  if (y < 145) newPage();
  y -= 17;
  const cards = [['SERVIÇOS', String(report.totals.sales)], ['VALOR TOTAL', formatMoney(report.totals.amountCents)], ['PAGAMENTO CONFIRMADO', formatMoney(report.totals.receivedCents)], ['SALDO PENDENTE', formatMoney(report.totals.balanceCents)]];
  const cardWidth = (WIDTH - 30) / 4;
  cards.forEach(([label, value], i) => {
    const x = M + i * (cardWidth + 10); rect(x, y - 50, cardWidth, 50);
    text(label, x + 11, y - 15, 6.5, true, muted); text(value, x + 11, y - 36, 12, true, navy);
  });
  y -= 70;
  const basis = 'Data: criação da venda. Situação: tipo de serviço cadastrado na venda. Pagamentos confirmados, descontados os estornos; datas ausentes não são estimadas.';
  wrap(basis, WIDTH, 7).forEach((s, i) => text(s, M, y - i * 11, 7, false, muted));
  doc.getPages().forEach((p, i, pages) => {
    page = p; page.drawLine({start: {x: M, y: 34}, end: {x: W - M, y: 34}, color: line, thickness: .6});
    text('CENTRAL EXPRESS | TRANSPORTE DE VEÍCULOS', M, 21, 7, true, navy);
    text(`Página ${i + 1} de ${pages.length}`, W - M - 70, 21, 7, false, muted);
  });
  doc.setTitle(`OS - Relação de serviços - ${report.client.name}`); doc.setAuthor('Central Express');
  return doc.save();
}
