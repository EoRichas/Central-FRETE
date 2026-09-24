import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { ServiceOrderVersion } from '@/lib/domain/service-order';
import { ORIGIN_LOCATION_TYPE_LABELS } from '@/lib/domain/operations';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date = (value: string | null) => value ? value.slice(0,10).split('-').reverse().join('/') : 'Não informado';
const methods: Record<string,string> = { BOLETO:'Boleto bancário',DINHEIRO:'Dinheiro',CREDITO:'Cartão de crédito',DEBITO:'Cartão de débito',PIX:'Pix',FATURADO:'Faturado' };

export async function renderServiceOrderPdf(order: ServiceOrderVersion): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regularBytes,boldBytes] = await Promise.all([
    readFile(path.join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
    readFile(path.join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
  ]);
  const normal = await doc.embedFont(regularBytes,{subset:true});
  const bold = await doc.embedFont(boldBytes,{subset:true});
  const logo = await doc.embedPng(await readFile(path.join(process.cwd(),'public/central-express-logo.png')));
  const s = order.snapshot;
  doc.setTitle(`Ordem de Serviço ${s.saleNumber} | Central Express`);
  doc.setAuthor('Central Express');
  const ink = rgb(.12,.17,.25), blue = rgb(.08,.26,.49), muted = rgb(.36,.41,.48), line = rgb(.83,.87,.91);
  const left = 42, width = 511;
  let page: PDFPage, y = 0;
  // Embed fonts to keep Portuguese text and character widths stable on printers and PDF viewers.
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
  function newPage() {
    page=doc.addPage([595.28,841.89]);
    page.drawRectangle({x:0,y:828,width:595.28,height:14,color:blue});
    const dimensions = logo.scaleToFit(115,62);
    page.drawImage(logo,{x:left,y:752,width:dimensions.width,height:dimensions.height});
    text('ORDEM DE SERVIÇO',280,792,17,bold,blue);
    text(`OS ${s.saleNumber} • Versão ${order.version}`,280,771,10,bold);
    text(`Venda ${s.saleNumber} • ${date(s.saleDate)}`,280,755,10);
    page.drawLine({start:{x:left,y:736},end:{x:left+width,y:736},thickness:1,color:line});
    y=717;
  }
  function ensure(height: number) { if(y-height < 62) newPage(); }
  function paragraph(value: string,size=10,font=normal,color=ink) {
    for(const row of lines(value,width,size,font)) { ensure(15); text(row,left,y,size,font,color); y-=15; }
  }
  function section(title: string) { ensure(46); y-=8; text(title.toLocaleUpperCase('pt-BR'),left,y,9,bold,blue); y-=17; }
  function field(label: string,value: string | null) { paragraph(`${label}: ${value || 'Não informado'}`); }
  function table(headers: string[], rows: string[][], widths: number[]) {
    function heading() {
      ensure(30); page.drawRectangle({x:left,y:y-8,width,height:23,color:rgb(.92,.95,.98)});
      let x=left+7; headers.forEach((h,i) => {text(h,x,y,9,bold,blue);x+=widths[i];});y-=26;
    }
    heading();
    for(const row of rows) {
      const wrapped=row.map((cell,i)=>lines(cell,widths[i]-14,9));
      const height=Math.max(...wrapped.map(c=>c.length))*13+13;
      if(y-height<62) {newPage();heading();}
      let x=left+7;
      wrapped.forEach((cell,i)=>{cell.forEach((v,j)=>text(v,x,y-j*13,9));x+=widths[i];});
      y-=height;
      page.drawLine({start:{x:left,y:y+8},end:{x:left+width,y:y+8},thickness:.5,color:line});
    }
  }
  newPage();
  paragraph(s.issuer.name,12,bold);
  if(s.issuer.document) field('CNPJ',s.issuer.document);
  if(s.issuer.address) paragraph(s.issuer.address,9,normal,muted);
  if(s.issuer.contact) paragraph(s.issuer.contact,9,normal,muted);
  section('Cliente');
  paragraph(s.clientName || 'Cliente não informado',11,bold);
  field('CPF/CNPJ',s.clientDocument);field('Endereço',s.clientAddress);
  section('Transporte');field('Origem',s.origin);if(s.originLocationType) field('Local da origem',ORIGIN_LOCATION_TYPE_LABELS[s.originLocationType]);field('Destino',s.destination);if(s.destinationLocationType) field('Local do destino',ORIGIN_LOCATION_TYPE_LABELS[s.destinationLocationType]);
  if(s.pickupAddress) field('Coleta',s.pickupAddress);
  if(s.deliveryAddress) field('Entrega',s.deliveryAddress);
  y-=5;
  table(['Un.','Modelo','Placa','Identificação'],s.cargoVehicles.map((v,i)=>[String(i+1),v.model||'Não informado',v.plate||'Não informada',v.identification||'Não informada']),[32,211,88,180]);
  paragraph(`Quantidade total: ${s.cargoVehicles.length} veículo(s)`,10,bold);
  section('Valores e pagamento');
  field('Valor do frete',money(s.freightAmountCents));
  paragraph(`VALOR TOTAL   ${money(s.freightAmountCents)}`,14,bold,blue);y-=4;
  if(s.installments.length) table(['Parcela','Forma de pagamento','Vencimento','Valor'],s.installments.map((i,index)=>[String(index+1),methods[i.paymentMethod]||i.paymentMethod,date(i.dueDate),money(i.amountCents)]),[52,221,108,130]);
  else { field('Forma de pagamento',null);field('Vencimento',date(s.financialDueDate)); }
  section('Operação e observações');
  field('Prazo operacional',s.operationalDeadlineDays == null ? null : `${s.operationalDeadlineDays} dias`);
  if(s.deliveryDeadline) field('Previsão de chegada',date(s.deliveryDeadline));
  paragraph(s.notes || 'Sem observações.');
  const pages=doc.getPages();
  for(let i=0;i<pages.length;i++) {page=pages[i];text(`Central Express • Emitida em ${date(order.createdAt)} • OS ${s.saleNumber} v${order.version}`,left,34,8,normal,muted);text(`${i+1} / ${pages.length}`,520,34,8,normal,muted);}
  return doc.save();
}
