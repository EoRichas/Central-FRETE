import { cargoPlateKey } from '@/lib/domain/cargo-vehicles';
import { VEHICLE_REPORT_PAYMENT_LABELS, type FleetVehicleReport } from '@/lib/domain/fleet-client-report';
import { formatDate, formatMoney } from '@/lib/format';
import { ReportPdf } from './pdf-layout';

export async function renderFleetVehicleReportPdf(report: FleetVehicleReport) {
  const document = await ReportPdf.create('Relatório de Veículos',[
    ['Placa',report.plate==='*'?'Todas as placas':report.plate],
    ['Período de criação',`${formatDate(report.from)} a ${formatDate(report.to)}`],
    ['Situação do pagamento',VEHICLE_REPORT_PAYMENT_LABELS[report.paymentFilter]],
  ],true,'Vendas da Frota por placa transportada',true);
  const paid = report.rows.filter(row=>row.paid==='Sim').length;
  document.section('Vendas vinculadas');
  document.table([
    {label:'Venda',width:56},{label:'Criação',width:67},{label:'Cliente',width:document.width-385},
    {label:'Veículo / placa',width:108},{label:'Valor',width:75,align:'right'},{label:'Pagamento',width:79},
  ],report.rows.map(row=>[
    row.saleNumber,formatDate(row.createdDate),row.clientName,
    row.vehicles.map(v=>[v.model,cargoPlateKey(v.plate)].filter(Boolean).join(' · ')).join('\n'),
    formatMoney(row.amountCents),row.paid==='Sim'?'Pago':row.paid==='Parcial'?'Não pago (parcial)':'Não pago',
  ]));
  document.note(`${report.totals.sales} venda(s) · ${paid} paga(s) · ${report.totals.sales-paid} não paga(s) · Valor total: ${formatMoney(report.totals.amountCents)}`);
  document.note('Período pela data de criação da venda. A situação se refere ao recebimento da venda.');
  return document.save();
}
