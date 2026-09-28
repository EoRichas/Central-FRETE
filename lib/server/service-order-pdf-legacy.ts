import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { ServiceOrderVersion } from '@/lib/domain/service-order';
import { formatRouteLocationType } from '@/lib/domain/operations';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const date = (value: string | null) => value ? value.slice(0,10).split('-').reverse().join('/') : 'Não informado';
const methods: Record<string,string> = { BOLETO:'Boleto bancário', DINHEIRO:'Dinheiro', CREDITO:'Cartão de crédito', DEBITO:'Cartão de débito', PIX:'Pix', FATURADO:'Faturado' };
// Coordinates refer to the supplied portrait letterhead. The second reference is a footer detail.
export const SERVICE_ORDER_LAYOUT = { width:595.28, height:841.89, left:42, contentWidth:511.28, top:582, bottom:216 } as const;

export async function renderServiceOrderPdf(order: ServiceOrderVersion): Promise<Uint8Array> {
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
  function lines(value: string, maxWidth: number, size = 10, font: PDFFont = normal) {
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
  function text(value: string,x: number,at: number,size=10,font=normal,color=ink) { page.drawText(safe(value),{x,y:at,size,font,color}); }
  function centered(value: string,at: number,size=10,font=normal,color=ink) {
    text(value,left+(width-font.widthOfTextAtSize(safe(value),size))/2,at,size,font,color);
  }
  function newPage() {
    page=doc.addPage([SERVICE_ORDER_LAYOUT.width,SERVICE_ORDER_LAYOUT.height]);
    const scale=Math.min(SERVICE_ORDER_LAYOUT.width/background.width,SERVICE_ORDER_LAYOUT.height/background.height);
    const fit=background.scale(scale);
    page.drawPage(background,{x:(SERVICE_ORDER_LAYOUT.width-fit.width)/2,y:(SERVICE_ORDER_LAYOUT.height-fit.height)/2,...fit});
    centered('ORDEM DE SERVIÇO',640,17,bold,blue);
    centered(`Venda ${s.saleNumber}  •  Versão ${order.version}  •  ${date(s.saleDate)}`,619,10,normal,muted);
    page.drawLine({start:{x:left,y:606},end:{x:left+width,y:606},thickness:.8,color:line});
    y=top;
  }
  function ensure(height: number) { if(y-height < bottom) newPage(); }
  function paragraph(value: string,size=10,font=normal,color=ink) {
    for(const row of lines(value,width,size,font)) { ensure(16); text(row,left,y,size,font,color); y-=16; }
  }
  function section(title: string, minimumBody=32) { ensure(32+minimumBody); y-=8; text(title.toLocaleUpperCase('pt-BR'),left,y,10,bold,blue); y-=24; }
  function field(label: string,value: string | null) { paragraph(`${label}: ${value || 'Não informado'}`); y-=3; }
  function table(headers: string[], rows: string[][], widths: number[]) {
    function heading() {
      ensure(54);
      page.drawRectangle({x:left,y:y-9,width,height:25,color:rgb(.93,.95,.98)});
      let x=left+8; headers.forEach((h,i) => {text(h,x,y,9,bold,blue);x+=widths[i];});y-=30;
    }
    heading();
    for(const row of rows) {
      const wrapped=row.map((cell,i)=>lines(cell,widths[i]-16,10));
      const count=Math.max(...wrapped.map(c=>c.length));
      // Split oversized cells across pages instead of allowing one tall row into the footer.
      let offset=0;
      while(offset<count) {
        if(y-bottom<28) {newPage();heading();}
        const capacity=Math.max(1,Math.floor((y-bottom-12)/15));
        const chunk=Math.min(count-offset,capacity);
        let x=left+8;
        wrapped.forEach((cell,i)=>{cell.slice(offset,offset+chunk).forEach((v,j)=>text(v,x,y-j*15,10));x+=widths[i];});
        y-=chunk*15+12; offset+=chunk;
        page.drawLine({start:{x:left,y:y+6},end:{x:left+width,y:y+6},thickness:.5,color:line});
        if(offset<count) {newPage();heading();}
      }
    }
    y-=6;
  }
  newPage();
  // Issuer identity is already printed in the letterhead. Snapshot CNPJ is additional data.
  if(s.issuer.document) field('CNPJ do emitente',s.issuer.document);
  section('Cliente');
  paragraph(s.clientName || 'Cliente não informado',11,bold); y-=3;
  field('CPF/CNPJ',s.clientDocument); field('Endereço',s.clientAddress);
  section('Transporte'); field('Origem',s.origin); field('Destino',s.destination);
  if(s.pickupAddress) field('Coleta',s.pickupAddress);
  if(s.deliveryAddress) field('Entrega',s.deliveryAddress);
  section('Veículos transportados',60);
  table(['Un.','Modelo','Placa'],s.cargoVehicles.map((v,i)=>[String(i+1),v.model||'Não informado',v.plate||'Não informada']),[38,343,130.28]);
  paragraph(`Quantidade total: ${s.cargoVehicles.length} veículo(s)`,10,bold);
  section('Operação e valores',200);
  field('Tipo de operação',formatRouteLocationType(s.originLocationType,s.destinationLocationType));
  if(s.operationalDeadlineDays != null) field('Prazo operacional',`${s.operationalDeadlineDays} dias`);
  const values: string[][] = [['Valor do frete',money(s.freightAmountCents)]];
  if(s.schemaVersion===2) {
    const v=s.operationValues;
    values.push(['Custo da operação',money(v.totalOperationCostCents)],['Seguro',money(v.insuranceCents)],
      ['Nota Fiscal',money(v.invoiceCents)],['ICMS',money(v.icmsCents)],['CTE / MDF',money(v.cteMdfeCents)]);
    if(v.legacyCombinedTaxTransportCents) values.push(['ICMS / CTE / MDF (legado combinado)',money(v.legacyCombinedTaxTransportCents)]);
  }
  // Two value columns keep the section readable without a long one-value-per-row table.
  for(let i=0;i<values.length;i+=2) {
    ensure(34);
    for(let col=0;col<2;col++) {
      const item=values[i+col]; if(!item) continue;
      const x=left+col*(width/2);
      text(item[0],x,y,9,normal,muted);
      text(item[1],x,y-15,11,bold);
    }
    y-=34;
  }

  if(s.schemaVersion===1) paragraph('Custos não registrados nesta versão histórica.',9,normal,muted);
  section('Pagamento',60);
  if(s.installments.length) table(['Parcela','Forma de pagamento','Vencimento','Valor'],s.installments.map((i,index)=>[String(index+1),methods[i.paymentMethod]||i.paymentMethod,date(i.dueDate),money(i.amountCents)]),[52,200,119,140.28]);
  else { field('Forma de pagamento',null); field('Vencimento',date(s.financialDueDate)); }
  section('Observações'); paragraph(s.notes || 'Sem observações.');
  const pages=doc.getPages();
  for(let i=0;i<pages.length;i++) {
    page=pages[i];
    text(`Emitida em ${date(order.createdAt)} • OS ${s.saleNumber} v${order.version}`,left,199,8,normal,muted);
    const pagination=`${i+1} / ${pages.length}`;
    text(pagination,left+width-normal.widthOfTextAtSize(pagination,8),199,8,normal,muted);
  }
  return doc.save();
}
