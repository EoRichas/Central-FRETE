import { providerKindLabel } from '@/lib/domain/provider-services';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { FleetClientReport } from '@/lib/domain/fleet-client-report';
import { formatDate, formatMoney } from '@/lib/format';

export type ClientReportObservation = {saleId: string; text: string};
const W = 595.28, H = 841.89, M = 28, WIDTH = W - 2 * M;
const navy = rgb(.035, .09, .29), ink = rgb(.09, .14, .23), muted = rgb(.37, .44, .54), pale = rgb(.94, .96, .98), white = rgb(1, 1, 1), line = rgb(.83, .87, .93);
const green = rgb(.09, .4, .28), amber = rgb(.6, .36, .08);

/** Customer relation: no cost, commission, margin or internal identity is exported. */
export async function renderFleetClientPdf(report: FleetClientReport, observations: ClientReportObservation[], orderNumber?: string, options:{includeProviders?:boolean}={}) {
  // The aggregate relation uses tighter spacing; individual OS keeps its layout.
  const compact = !orderNumber;
  const rowMin = compact ? 44 : 68, lineHeight = compact ? 9 : 11;
  const rowPadding = compact ? 16 : 22, textTop = compact ? 14 : 21;
  const headerHeight = compact ? 30 : 38;
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
  const wrap = (value: string, width: number, size = 6.4, strong = false) => {
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
  const text = (s: string, x: number, yy: number, size = 8, strong = false, color = ink) => {page.drawText(safe(s), {x, y: yy, size, font: strong ? bold : regular, color});};
  const rect = (x: number, yy: number, w: number, h: number, color = pale) => {page.drawRectangle({x, y: yy, width: w, height: h, color});};
  const newPage = () => {
    page = doc.addPage([W, H]);
    const pageIndex=doc.getPageCount()-1;
    if(pageIndex!==0){y=H-M;return;}
    rect(0, H - 108, W, 108, navy); rect(M, H - 82, 3, 59, rgb(.8, .12, .16));
    text('CENTRAL EXPRESS', M + 15, H - 38, 19, true, white);
    text('TRANSPORTE DE VEÍCULOS', M + 15, H - 54, 8, false, white);
    text(orderNumber ? `OS ${orderNumber} | RELAÇÃO DE SERVIÇOS` : 'RELATÓRIO DE VENDAS | RELAÇÃO DE SERVIÇOS', M + 15, H - 81, 11, true, white);
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
    {label: 'DATA', width: 54}, {label: 'MOTORISTA', width: 54}, {label: 'CLIENTE', width: 55},
    {label: 'VEÍCULO', width: 54}, {label: 'PLACA', width: 46}, {label: 'SITUAÇÃO', width: 62},
    {label: 'CLIENTE / OBSERVAÇÃO', width: 90}, {label: 'VALOR\nSERVIÇO', width: 62},
    {label: 'CONFIRMAÇÃO\nDO PAGAMENTO', width: WIDTH - 477},
  ];
  const heading = () => {
    rect(M, y - headerHeight, WIDTH, headerHeight, navy); let x = M;
    columns.forEach(c => { wrap(c.label, c.width - 10, 5.6, true).forEach((s, i) => text(s, x + 5, y - 13 - i * 8, 5.6, true, white)); x += c.width; }); y -= headerHeight;
  };
  const renderBody=()=>{
  newPage(); heading();
  for (const [index, row] of report.rows.entries()) {
    const models = row.vehicles.map(v => v.model || 'Não informado').join('\n');
    const plates = row.vehicles.map(v => v.plate || v.identification || 'Não informada').join('\n');
    const payment = row.paid === 'Sim' ? 'CONFIRMADO' : row.paid === 'Parcial' ? 'PARCIAL' : 'PENDENTE';
    const confirmation = `${payment}\n${row.receivedDates.length ? row.receivedDates.map(d => formatDate(d)).join(', ') : 'Data não informada'}\n${formatMoney(row.receivedCents)}`;
    // Only explicitly selected observations enter a customer document.
    const cells = [formatDate(row.createdDate), row.driverName || 'Não informado', row.clientName,
      models || 'Não informado', plates || 'Não informada', row.serviceSituation || 'Não informada',
      `${row.clientName}\n${notes.get(row.id) || 'Sem observação incluída.'}${orderNumber && row.returnFreight ? '\nFrete retorno aproveitado' : ''}${options.includeProviders&&(row.providerServices?.length)?'\nPRESTADORES: '+row.providerServices.map(p=>`${p.providerName}${p.referenceName?' / '+p.referenceName:''} · ${providerKindLabel(p.kind)}: ${formatMoney(p.amountCents)}`).join('\n'):''}`, formatMoney(row.amountCents), confirmation];
    const lines = cells.map((cell, i) => wrap(cell, columns[i].width - 15, 6.4, i === 7));
    const count = Math.max(...lines.map(l => l.length));
    // Move normal rows intact. Extremely long notes continue with repeated headings.
    const rowHeight = Math.max(rowMin, count * lineHeight + rowPadding);
    const freshTop = H-M-headerHeight;
    if (y - rowHeight < 57 && rowHeight <= freshTop - 57) { newPage(); heading(); }
    let offset = 0;
    while (offset < count) {
      if (y < 57 + rowMin) { newPage(); heading(); }
      const capacity = Math.max(1, Math.floor((y - 57 - rowPadding) / lineHeight));
      const n = Math.min(capacity, count - offset), height = Math.max(rowMin, n * lineHeight + rowPadding);
      if (y - height < 57) { newPage(); heading(); continue; }
      if (index % 2 === 0) rect(M, y - height, WIDTH, height);
      let x = M;
      columns.forEach((c, i) => {
        const visible = lines[i].slice(offset, offset + n);
        // Repeat available context when a selected note spans multiple pages.
        if (!visible.length && offset > 0 && i !== 6) visible.push(...lines[i].slice(0, n));
        visible.forEach((s, j) => {
          const strong = i === 7, color = i === 8 && offset + j === 0 ? (row.paid === 'Sim' ? green : amber) : ink;
          const xx = i === 7 ? x + c.width - 7 - bold.widthOfTextAtSize(s, 6.4) : x + 8;
          text(s, xx, y - textTop - j * lineHeight, 6.4, strong, color);
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
  };
  renderBody();
  doc.getPages().forEach((p, i, pages) => {
    page = p; page.drawLine({start: {x: M, y: 34}, end: {x: W - M, y: 34}, color: line, thickness: .6});
    text('CENTRAL EXPRESS | TRANSPORTE DE VEÍCULOS', M, 21, 7, true, navy);
    text(`Página ${i + 1} de ${pages.length}`, W - M - 70, 21, 7, false, muted);
  });
  doc.setTitle(`${orderNumber ? `OS ${orderNumber}` : 'Relatório de vendas'} - Relação de serviços - ${report.client.name}`); doc.setAuthor('Central Express');
  return doc.save();
}
