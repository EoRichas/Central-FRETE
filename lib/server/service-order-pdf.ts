import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { renderServiceOrderPdf as renderLegacyOrder } from './service-order-pdf-legacy';
import fontkit from '@pdf-lib/fontkit';
import type { ServiceOrderVersion } from '@/lib/domain/service-order';
import { formatRouteLocationType } from '@/lib/domain/operations';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const date = (value: string | null) => value ? value.slice(0,10).split('-').reverse().join('/') : 'Não informado';
const methods: Record<string,string> = { BOLETO:'Boleto bancário', DINHEIRO:'Dinheiro', CREDITO:'Cartão de crédito', DEBITO:'Cartão de débito', PIX:'Pix', FATURADO:'Faturado' };
// Coordinates refer to the supplied portrait letterhead. The second reference is a footer detail.
export const SERVICE_ORDER_LAYOUT = { width:595.28, height:841.89, left:42, contentWidth:511.28, top:582, bottom:216 } as const;

export async function renderServiceOrderPdf(order: ServiceOrderVersion): Promise<Uint8Array> {
  if (order.snapshot.schemaVersion !== 3) return renderLegacyOrder(order);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regularBytes,boldBytes,backgroundBytes] = await Promise.all([
    readFile(path.join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
    readFile(path.join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
    readFile(path.join(process.cwd(),'public/service-order-background-portrait.pdf')),
  ]);
  const normal = await doc.embedFont(regularBytes,{subset:true});
  const bold = await doc.embedFont(boldBytes,{subset:true});
  const [background] = await doc.embedPdf(backgroundBytes, [0]);
  const s = order.snapshot;
  doc.setTitle(`Ordem de Serviço ${s.saleNumber} | Central Express`);
  doc.setAuthor('Central Express');
  const ink = rgb(.10,.14,.23), blue = rgb(.02,.16,.40), muted = rgb(.32,.36,.42), line = rgb(.78,.82,.88);
  const {left, contentWidth:width, top, bottom} = SERVICE_ORDER_LAYOUT;
  let page: PDFPage, y = 0;
  const supported = new Set(normal.getCharacterSet());
  function safe(value: string) { return [...value.normalize('NFC')].map(c => c === '\n' || supported.has(c.codePointAt(0)!) ? c : '?').join(''); }
  function lines(value: string, maxWidth: number, size = 9, font: PDFFont = normal) {
    const output: string[] = [];
    for (const paragraph of safe(value).split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate,size) <= maxWidth) current = candidate;
        else {
          if(current) output.push(current);
          current = '';
          for(const character of word) {
            if(font.widthOfTextAtSize(current + character,size) > maxWidth) { output.push(current); current = ''; }
            current += character;
          }
        }
      }
      output.push(current);
    }
    return output;
  }
  function text(value: string,x: number,at: number,size=9,font=normal,color=ink) { page.drawText(safe(value),{x,y:at,size,font,color}); }
  function centered(value: string,at: number,size=9,font=normal,color=ink) {
    text(value,left+(width-font.widthOfTextAtSize(safe(value),size))/2,at,size,font,color);
  }
  function newPage() {
    page=doc.addPage([SERVICE_ORDER_LAYOUT.width,SERVICE_ORDER_LAYOUT.height]);
    const scale=Math.min(SERVICE_ORDER_LAYOUT.width/background.width,SERVICE_ORDER_LAYOUT.height/background.height);
    const fit=background.scale(scale);
    page.drawPage(background,{x:(SERVICE_ORDER_LAYOUT.width-fit.width)/2,y:(SERVICE_ORDER_LAYOUT.height-fit.height)/2,...fit});
    if (s.issuer.contactSource === 'USER') {
      // The original stationery contains a rasterized fixed phone. Mask only
      // that line and render the contact saved in this document's snapshot.
      page.drawRectangle({x:76,y:147,width:160,height:16,color:rgb(1,1,1)});
      const digits = s.issuer.contact || '';
      const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
      const formatted = local.length === 11 ? `(${local.slice(0,2)}) ${local.slice(2,7)}-${local.slice(7)}`
        : local.length === 10 ? `(${local.slice(0,2)}) ${local.slice(2,6)}-${local.slice(6)}` : digits;
      text(formatted || 'Telefone não informado',78,152,9,normal,blue);
    }
    centered('ORDEM DE SERVIÇO',640,17,bold,blue);
    centered(`Venda ${s.saleNumber}  •  ${date(s.saleDate)}`,619,10,normal,muted);
    page.drawLine({start:{x:left,y:606},end:{x:left+width,y:606},thickness:.8,color:line});
    y=top;
  }
  function ensure(height: number) { if(y-height < bottom) newPage(); }
  function paragraph(value: string,size=9,font=normal,color=ink) {
    for(const row of lines(value,width,size,font)) { ensure(13); text(row,left,y,size,font,color); y-=13; }
  }
  function section(title: string, minimumBody=32) { ensure(24+minimumBody); y-=5; text(title.toLocaleUpperCase('pt-BR'),left,y,10,bold,blue); y-=19; }
  function field(label: string,value: string | null) { paragraph(`${label}: ${value || 'Não informado'}`); y-=2; }
  function table(headers: string[], rows: string[][], widths: number[]) {
    function heading() {
      ensure(40);
      page.drawRectangle({x:left,y:y-9,width,height:22,color:rgb(.93,.95,.98)});
      let x=left+4; headers.forEach((h,i) => {text(h,x,y,9,bold,blue);x+=widths[i];});y-=24;
    }
    heading();
    for(const row of rows) {
      const wrapped=row.map((cell,i)=>lines(cell,widths[i]-8,9));
      const count=Math.max(...wrapped.map(c=>c.length));
      // Split oversized cells across pages instead of allowing one tall row into the footer.
      let offset=0;
      while(offset<count) {
        if(y-bottom<25) {newPage();heading();}
        const capacity=Math.max(1,Math.floor((y-bottom-8)/13));
        const chunk=Math.min(count-offset,capacity);
        let x=left+4;
        wrapped.forEach((cell,i)=>{cell.slice(offset,offset+chunk).forEach((v,j)=>text(v,x,y-j*13,9));x+=widths[i];});
        y-=chunk*13+8; offset+=chunk;
        page.drawLine({start:{x:left,y:y+6},end:{x:left+width,y:y+6},thickness:.5,color:line});
        if(offset<count) {newPage();heading();}
      }
    }
    y-=6;
  }
  newPage();
  if(s.issuer.document) field('CNPJ',s.issuer.document);
  paragraph(s.clientName || 'Cliente não informado',11,bold);
  if(s.clientDocument) field('CPF/CNPJ',s.clientDocument);
  if(s.clientEmail) field('E-mail',s.clientEmail);
  if(s.clientAddress) paragraph(s.clientAddress);
  y-=12;
  // The sale prices a transport service as a whole. Do not invent per-vehicle prices.
  const cargo=s.cargoVehicles.map(v=>[v.model,v.plate ? `PLACA ${v.plate}` : null].filter(Boolean).join(' ')).join('\n');
  table(['Qt.','Produto/Serviço','Detalhe do item','Valor unitário','Subtotal'],[
    ['1',`${s.origin} X ${s.destination}`,cargo || 'Transporte de veículos',money(s.freightAmountCents),money(s.freightAmountCents)],
  ],[25,135,170,91,90.28]);
  ensure(38);
  text('Total',left+width-175,y,9,normal,muted);
  text(money(s.freightAmountCents),left+width-bold.widthOfTextAtSize(money(s.freightAmountCents),10),y,10,bold); y-=18;
  text('Valor líquido',left+width-175,y,9,bold);
  text(money(s.freightAmountCents),left+width-bold.widthOfTextAtSize(money(s.freightAmountCents),10),y,10,bold); y-=22;
  ensure(65);
  paragraph('Condição de pagamento:',9,bold); y-=3;
  const paymentMethods=[...new Set(s.installments.map(i=>methods[i.paymentMethod] || i.paymentMethod))];
  field('Forma de pagamento',paymentMethods.join(' / ') || null);
  table(['Nº','Vencimento','Valor (R$)','Observações'],
    s.installments.length ? s.installments.map((i,index)=>[String(index+1),date(i.dueDate),money(i.amountCents),`Venda ${s.saleNumber}`]) :
      [['1',date(s.financialDueDate),money(s.freightAmountCents),`Venda ${s.saleNumber}`]],
    [30,100,110,271.28]);
  section('Condições do transporte',40);
  paragraph(s.originLocationType || s.destinationLocationType ? formatRouteLocationType(s.originLocationType,s.destinationLocationType).replace(' → ', ' A ') : 'Não informado',9,bold);
  if(s.operationalDeadlineDays != null) paragraph(`Prazo: ${s.operationalDeadlineDays} dias.`);
  if(s.notes) paragraph(s.notes);
  const pages=doc.getPages();
  for(let i=0;i<pages.length;i++) {
    page=pages[i];
    text(`Emitida em ${date(order.createdAt)} • OS ${s.saleNumber}`,left,209,8,normal,muted);
    const pagination=`${i+1} / ${pages.length}`;
    text(pagination,left+width-normal.widthOfTextAtSize(pagination,8),209,8,normal,muted);
  }
  return doc.save();
}
