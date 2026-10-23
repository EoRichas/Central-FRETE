import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir,writeFile } from 'node:fs/promises';
import { unzipSync,strFromU8 } from 'fflate';
import { renderXlsx } from '../lib/server/reports/xlsx.ts';

test('Excel exporta valores numéricos, filtros e totais; texto fornecido pelo usuário nunca vira fórmula',async()=>{
 const bytes=renderXlsx([{name:'Vendas',title:'Relatório de cobrança',subtitle:'CLIENTE EXEMPLO · Outubro de 2026',columns:[{label:'Venda',width:18},{label:'Cliente',width:35},{label:'Valor',kind:'money',width:22}],rows:[['2027-1','EMPRESA & CLIENTE <M1>',10.01],['2027-2','=HYPERLINK("https://example.test")',20.02]],totals:true}]);
 const files=unzipSync(bytes),sheet=strFromU8(files['xl/worksheets/sheet1.xml']);
 assert.match(sheet,/EMPRESA &amp; CLIENTE &lt;M1&gt;/);assert.match(sheet,/t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/);
 assert.match(sheet,/<c r="C4" s="2" t="n"><v>10.01<\/v>/);assert.match(sheet,/<f>SUM\(C4:C5\)<\/f>/);assert.match(sheet,/autoFilter ref="A3:C5"/);assert.match(sheet,/state="frozen"/);
 assert.equal((sheet.match(/<f>/g)??[]).length,1);
 if(process.env.CENTRAL_XLSX_QA_OUTPUT){await mkdir(process.env.CENTRAL_XLSX_QA_OUTPUT,{recursive:true});await writeFile(`${process.env.CENTRAL_XLSX_QA_OUTPUT}/relatorio-exemplo.xlsx`,bytes);}
});
