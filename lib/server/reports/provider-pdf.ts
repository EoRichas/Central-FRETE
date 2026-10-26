import type { loadProviderReport } from '../provider-report';
import { providerKindLabel } from '@/lib/domain/provider-services';
import { formatDate,formatMoney } from '@/lib/format';
import { ReportPdf } from './pdf-layout';
export async function renderProviderPdf(report:Awaited<ReturnType<typeof loadProviderReport>>) {
 const p=await ReportPdf.create('Relatório de prestadores',[['Coleta de',formatDate(report.from)],['Até',formatDate(report.to)]],true);
 p.note('Os valores dos prestadores são separados do frete. A confirmação de pagamento abaixo se refere ao recebimento da venda, não ao pagamento do prestador.');
 p.table([{label:'Venda / datas / recebimento',width:145},{label:'Motorista / cliente / veículo',width:175},{label:'Prestador / serviço / observação',width:p.width-320}],report.rows.map(r=>[
  `Venda ${r.saleNumber}\nCriação: ${formatDate(r.createdDate)}\nSaída / coleta: ${formatDate(r.date)}\nValor do frete: ${formatMoney(r.saleAmountCents)}\nRecebido: ${formatMoney(r.paymentStatus==='PAGO'?r.saleAmountCents:0)}\nPago: ${r.paymentStatus==='PAGO'?'Sim':'Não'}\nData do recebimento: ${r.paymentStatus==='PAGO'&&r.paidAt?formatDate(r.paidAt):'Não informada'}`,
  `Motorista: ${r.driverName||'Não informado'}\nCliente: ${r.clientName}\n${r.vehicles.map(v=>`${v.model||'Não informado'} / ${v.plate||v.identification||'Placa não informada'}`).join('\n')}\nSituação do serviço: ${r.serviceSituation||'Não informada'}`,
  `${r.providerName}${r.referenceName?' / '+r.referenceName:''}\n${providerKindLabel(r.kind)}\nValor do prestador: ${formatMoney(r.amountCents)}\nObservação da OS: ${r.orderIncludeObservation?r.orderObservation||'Sem observação.':'Sem observação incluída.'}`
 ]));
 p.note(`Total dos prestadores: ${formatMoney(report.totalCents)}`);return p.save();
}
