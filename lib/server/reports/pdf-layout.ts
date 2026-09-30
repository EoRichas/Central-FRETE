import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFPage, type PDFFont, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const W=841.89,H=595.28,M=34;
export const reportColors={navy:rgb(.063,.176,.353),blue:rgb(.14,.345,.65),ink:rgb(.094,.157,.239),muted:rgb(.388,.447,.529),line:rgb(.86,.89,.92),pale:rgb(.953,.965,.98),white:rgb(1,1,1)};
export type ReportColumn={label:string;width:number;align?:'left'|'right'};
export class ReportPdf {
  readonly width=W-2*M; readonly left=M;
  page!:PDFPage; y=0;
  private constructor(readonly doc:PDFDocument,private normal:PDFFont,private bold:PDFFont,private logo:Awaited<ReturnType<PDFDocument['embedPng']>>,private title:string,private filters:[string,string][]){}
  static async create(title:string,filters:[string,string][]) {
    const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
    const [r,b,l]=await Promise.all([
      readFile(path.join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
      readFile(path.join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
      readFile(path.join(process.cwd(),'public/central-express-logo.png'))]);
    const result=new ReportPdf(doc,await doc.embedFont(r,{subset:true}),await doc.embedFont(b,{subset:true}),await doc.embedPng(l),title,filters);
    doc.setTitle(`${title} | Central Express`);doc.setAuthor('Central Express');result.newPage();return result;
  }
  private safe(value:string) {const chars=new Set(this.normal.getCharacterSet());return [...value.replace(/[\u0000-\u0008\u000b-\u001f]/g,'').normalize('NFC')].map(c=>c==='\n'||chars.has(c.codePointAt(0)!)?c:'?').join('');}
  text(value:string,x:number,y:number,size=9,bold=false,color:RGB=reportColors.ink,align:'left'|'right'='left') {
    const font=bold?this.bold:this.normal,s=this.safe(value);this.page.drawText(s,{x:align==='right'?x-font.widthOfTextAtSize(s,size):x,y,size,font,color});
  }
  rect(x:number,y:number,w:number,h:number,color:RGB=reportColors.pale){this.page.drawRectangle({x,y,width:w,height:h,color});}
  line(x:number,y:number,w:number,color:RGB=reportColors.line){this.page.drawLine({start:{x,y},end:{x:x+w,y},color,thickness:.6});}
  wrap(value:string,width:number,size=8,bold=false) {
    const font=bold?this.bold:this.normal,out:string[]=[];
    for(const paragraph of this.safe(value).split('\n')) {
      let current='';for(const word of paragraph.split(/\s+/)){
        const next=current?`${current} ${word}`:word;
        if(font.widthOfTextAtSize(next,size)<=width)current=next;
        else {if(current)out.push(current);current='';for(const char of word){if(font.widthOfTextAtSize(current+char,size)>width){out.push(current);current='';}current+=char;}}
      }out.push(current);
    }return out;
  }
  newPage(subtitle='Receitas, custos e resultados do período') {
    this.page=this.doc.addPage([W,H]);this.rect(0,H-5,W,5,reportColors.navy);
    this.page.drawImage(this.logo,{x:M,y:H-77,width:84,height:61});
    this.text('CENTRAL EXPRESS',M+101,H-31,10,true,reportColors.navy);
    this.text(this.title,M+101,H-56,this.title.length>22?20:23,true,reportColors.navy);
    this.text(subtitle,M+101,H-73,8,false,reportColors.muted);
    this.text('RELATÓRIO GERENCIAL',W-M,H-30,7.5,true,reportColors.blue,'right');
    this.text(new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),W-M,H-45,7.5,false,reportColors.muted,'right');
    this.line(M,H-89,this.width,reportColors.navy);
    const col=this.width/this.filters.length;
    const values=this.filters.map(([,value])=>this.wrap(value,col-24,8,true));
    const filterHeight=25+Math.max(...values.map(v=>v.length))*10;
    this.rect(M,H-101-filterHeight,this.width,filterHeight);
    let x=M+12;
    this.filters.forEach(([label],i)=>{this.text(label.toUpperCase(),x,H-114,6.5,true,reportColors.muted);values[i].forEach((line,j)=>this.text(line,x,H-127-j*10,8,true,reportColors.navy));x+=col;});
    this.y=H-122-filterHeight;
  }
  ensure(height:number){if(this.y-height<48)this.newPage('Continuação');}
  section(title:string){this.ensure(64);this.text(title,M,this.y,11,true,reportColors.navy);this.y-=19;}
  note(value:string,width=this.width,x=M,size=7.5){for(const row of this.wrap(value,width,size)){this.ensure(12);this.text(row,x,this.y,size,false,reportColors.muted);this.y-=12;}this.y-=5;}
  kpis(items:{label:string;value:string;detail:string}[]){const gap=10,w=(this.width-gap*(items.length-1))/items.length;
    items.forEach((item,i)=>{const x=M+i*(w+gap),accent=i===2;this.rect(x,this.y-72,w,72,accent?reportColors.navy:reportColors.pale);this.text(item.label,x+12,this.y-17,7,true,accent?reportColors.white:reportColors.muted);
      let size=19;while(this.bold.widthOfTextAtSize(item.value,size)>w-24&&size>10)size-=.5;
      this.text(item.value,x+12,this.y-43,size,true,accent?reportColors.white:reportColors.navy);this.text(item.detail,x+12,this.y-59,6.5,false,accent?reportColors.white:reportColors.muted);});this.y-=98;}
  table(columns:ReportColumn[],rows:string[][],options:{x?:number;top?:number;rowHeight?:number;total?:boolean}={}) {
    const x=options.x??M,width=columns.reduce((s,c)=>s+c.width,0);if(options.top!==undefined)this.y=options.top;
    const heading=()=>{this.ensure(50);const lines=columns.map(c=>this.wrap(c.label,c.width-14,7.2,true));const h=Math.max(25,Math.max(...lines.map(a=>a.length))*10+10);this.rect(x,this.y-h,width,h,reportColors.navy);let xx=x;
      columns.forEach((col,i)=>{lines[i].forEach((l,j)=>this.text(l,col.align==='right'?xx+col.width-7:xx+7,this.y-14-j*10,7.2,true,reportColors.white,col.align));xx+=col.width;});this.y-=h;};heading();
    if(!rows.length){this.rect(x,this.y-30,width,30);this.text('Nenhum registro no período.',x+8,this.y-18,8,false,reportColors.muted);this.y-=44;return this.y;}
    rows.forEach((row,index)=>{const bold=Boolean(options.total&&index===rows.length-1),wrapped=columns.map((col,i)=>this.wrap(row[i]??'',col.width-14,8,bold));let offset=0;const count=Math.max(...wrapped.map(r=>r.length));
      while(offset<count){let capacity=Math.floor((this.y-58)/11);if(capacity<1){this.newPage('Continuação');heading();capacity=Math.floor((this.y-58)/11);}
        const n=Math.min(capacity,count-offset),h=Math.max(options.rowHeight??24,n*11+10);
        if(this.y-h<48){this.newPage('Continuação');heading();}
        if(index%2===0||bold)this.rect(x,this.y-h,width,h);let xx=x;
        columns.forEach((col,i)=>{wrapped[i].slice(offset,offset+n).forEach((l,j)=>this.text(l,col.align==='right'?xx+col.width-7:xx+7,this.y-15-j*11,8,bold,bold?reportColors.navy:reportColors.ink,col.align));xx+=col.width;});
        this.y-=h;this.line(x,this.y,width);offset+=n;
      }
    });this.y-=14;return this.y;
  }
  async save(){const pages=this.doc.getPages();pages.forEach((page,i)=>{this.page=page;this.line(M,36,this.width);this.text('CENTRAL EXPRESS  |  Uso gerencial',M,23,7,false,reportColors.muted);this.text(`${i+1} / ${pages.length}`,W-M,23,7,false,reportColors.muted,'right');});return this.doc.save();}
}
export function pdfResponse(bytes:Uint8Array,filename:string){return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
