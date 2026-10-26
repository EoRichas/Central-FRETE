import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument,PDFPage } from 'pdf-lib';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { buildSalesReport,type ReportSale } from '../lib/domain/reports.ts';
import { renderSalesReportPdf } from '../lib/server/reports/render-reports.ts';
import { renderProviderPdf } from '../lib/server/reports/provider-pdf.ts';
import type { ProviderReportRow } from '../lib/server/provider-report.ts';
async function qa(name:string,bytes:Uint8Array){if(process.env.CENTRAL_FIX_QA){await mkdir(process.env.CENTRAL_FIX_QA,{recursive:true});await writeFile(`${process.env.CENTRAL_FIX_QA}/${name}.pdf`,bytes);}}
test('relatório geral mantém comissões completas e não imprime aviso parcial',async()=>{
 const sale:ReportSale={id:'one',saleNumber:'234',saleDate:'2026-10-26',saleChannel:'FROTA',sellerId:'seller',sellerName:'VENDEDOR DE EXEMPLO',clientName:'CLIENTE',freightAmountCents:1700000,commissionBasisPoints:1000,costsPending:true,pendingReason:'FUEL',costs:[],financial:{commissionCents:150000,transportCostCents:560855,marginCents:989145,marginBasisPoints:5818}};
 const report=buildSalesReport([sale,{...sale,id:'two',sellerId:'other',sellerName:'OUTRO VENDEDOR',saleNumber:'235',financial:{...sale.financial,commissionCents:42425}}]);
 const text:string[]=[],draw=PDFPage.prototype.drawText;
 PDFPage.prototype.drawText=function(value,options){text.push(value);assert.ok((options?.x??0)>=0);return draw.call(this,value,options);};
 try{const bytes=await renderSalesReportPdf(report,'2026-10','Frota');assert.ok(text.includes('1.500,00'));assert.ok(text.includes('1.924,25'));assert.ok(text.includes('Comissão (R$)'));assert.ok(text.includes('Vendas'));assert.ok(!text.some(t=>t.includes('Resultado parcial')));const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPage(0).getHeight()>pdf.getPage(0).getWidth());await qa('geral-corrigido',bytes);}finally{PDFPage.prototype.drawText=draw;}
});
test('relatório de prestadores imprime dados completos da venda e separa valores',async()=>{
 const row:ProviderReportRow={id:'service',providerId:'p',providerName:'PRESTADOR EXEMPLO',referenceName:'COLETA ESPECIAL',kind:'COLETA',amountCents:12345,freightId:'f',saleNumber:'234',date:'2026-10-26',createdDate:'2026-10-24',clientName:'CLIENTE EXEMPLO',driverName:'MOTORISTA EXEMPLO',vehicles:[{model:'FIAT STRADA',plate:'AAA1A11',identification:null}],serviceSituation:'ENTREGA',saleAmountCents:150000,paymentStatus:'PAGO',paidAt:'2026-10-26',notes:'NOTA INTERNA',orderObservation:'OBSERVAÇÃO SALVA NA OS',orderIncludeObservation:true};
 const text:string[]=[],draw=PDFPage.prototype.drawText;
 PDFPage.prototype.drawText=function(value,options){text.push(value);return draw.call(this,value,options);};
 try{const bytes=await renderProviderPdf({from:'2026-10-01',to:'2026-10-31',rows:[row],totalCents:12345,providers:[]});const joined=text.join(' ');for(const value of ['234','MOTORISTA EXEMPLO','CLIENTE EXEMPLO','FIAT STRADA','AAA1A11','ENTREGA','OBSERVAÇÃO SALVA NA OS','123,45','1.500,00'])assert.ok(joined.includes(value),value);assert.ok(!joined.includes('NOTA INTERNA'));assert.ok(joined.includes('não ao pagamento do prestador'));assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);await qa('prestadores-completo',bytes);}finally{PDFPage.prototype.drawText=draw;}
});
test('preferência escura antiga e tema do sistema não reativam modo escuro',async()=>{
 const source=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8');
 const script=source.match(/const themeBootstrap = `([\s\S]*?)`;/)![1];
 const root={dataset:{theme:'dark'},style:{colorScheme:'dark'}};let removed='';
 runInNewContext(script,{document:{documentElement:root},window:{localStorage:{removeItem:(key:string)=>{removed=key;},getItem:()=> 'dark'},matchMedia:()=>({matches:true})}});
 assert.equal(root.dataset.theme,'light');assert.equal(root.style.colorScheme,'light');assert.equal(removed,'cf-theme');
 const shell=await readFile(new URL('../components/app-shell.tsx',import.meta.url),'utf8');assert.ok(!shell.includes('bloom-switch'));assert.ok(!shell.includes('toggleDarkMode'));
});

test('retornos contam somente vendas Frota marcadas, por mês e caminhão, sem repetir venda',async()=>{
 const base:ReportSale={id:'one',saleNumber:'234',saleDate:'2026-10-26',saleChannel:'FROTA',sellerId:'seller',sellerName:'VENDEDOR',clientName:'CLIENTE',freightAmountCents:10000,commissionBasisPoints:0,costsPending:false,costs:[],financial:{commissionCents:0,transportCostCents:0,marginCents:10000,marginBasisPoints:10000},returnFreight:true,vehiclePlate:'aaa1a11'};
 const rows=[base,base,{...base,id:'two'},{...base,id:'nov',saleDate:'2026-11-01',vehiclePlate:'BBB2B22'},{...base,id:'missing',vehiclePlate:null},{...base,id:'unchecked',returnFreight:false},{...base,id:'cegonha',saleChannel:'CEGONHA' as const}];
 const report=buildSalesReport(rows);assert.equal(report.returnFreightCount,4);assert.deepEqual(report.returnFreights,[{competency:'2026-10',vehiclePlate:'AAA1A11',count:2},{competency:'2026-10',vehiclePlate:'Não informado',count:1},{competency:'2026-11',vehiclePlate:'BBB2B22',count:1}]);
 assert.equal(buildSalesReport(rows.filter(r=>r.saleDate.startsWith('2026-11'))).returnFreightCount,1);
 const {renderGeneralSalesXlsx}=await import('../lib/server/reports/sales-xlsx.ts');const {unzipSync,strFromU8}=await import('fflate');const files=unzipSync(renderGeneralSalesXlsx(report,false));const sheet=strFromU8(files['xl/worksheets/sheet2.xml']);assert.match(sheet,/AAA1A11/);assert.match(sheet,/BBB2B22/);assert.match(sheet,/>2<\/v>/);
 const texts:string[]=[],draw=PDFPage.prototype.drawText;PDFPage.prototype.drawText=function(value,options){texts.push(value);return draw.call(this,value,options);};
 try{const bytes=await renderSalesReportPdf(report,'2026-10 a 2026-11','Frota',false);assert.ok(texts.includes('AAA1A11'));assert.ok(texts.includes('BBB2B22'));assert.ok(texts.some(t=>t.includes('4 retorno(s)')));await qa('retornos-mes-caminhao',bytes);}finally{PDFPage.prototype.drawText=draw;}
});
