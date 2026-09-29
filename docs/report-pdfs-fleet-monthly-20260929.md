# PDFs gerenciais e fechamento exclusivo da Frota

Implementa os dois modelos aprovados em 29/09/2026, usando a organização do relatório de Rota-Proxima como referência e a identidade visual da Central Express.

## Comportamento

- Relatórios: PDF A4 horizontal com resumo, composição de custos, clientes, todas as vendas do mês, totais e paginação. Filtro Todos/Frota/Cegonha aplicado à tela e às exportações. Vendedores continuam restritos às próprias vendas.
- O relatório completo não usa o limite de 200/500 registros da listagem. Valores e permissões vêm da mesma consulta e cálculo da tela.
- Frota > Fechamento mensal: exporta a apuração atual ou o fechamento salvo selecionado. O PDF salvo usa o snapshot original, inclusive depois de alterações nos fretes.
- Receitas e despesas do fechamento incluem somente Frota: fretes operacionais, vendas FROTA sem vínculo, viagens e lançamentos explicitamente atribuídos à Frota. Vendas vinculadas não duplicam receita; Cegonha não entra nos totais nem bloqueia o fechamento por pendências.
- Combustível realizado e comissões dos motoristas são discriminados. Custos compartilhados continuam na competência da viagem, sem inventar rateio por frete no PDF. Despesas históricas sem detalhamento permanecem agrupadas.
- PDFs extensos continuam em páginas adicionais com cabeçalho e totalização. Pendências de custo, combustível ou faturamento deixam a apuração identificada como parcial.

## Migração 016

`npm run migrate` inclui `database/016_fleet_monthly_scope.sql`. Ela deve acompanhar a publicação do código; não foi executada em produção nesta entrega.

- Adiciona `scope` às tabelas de lançamentos e fechamentos mensais e unicidade de fechamento vigente por competência e escopo.
- Mantém lançamentos antigos como GENERAL, fora dos totais da Frota. A tela permite incluir individualmente um lançamento na Frota mediante confirmação de que o valor pertence integralmente a ela. A classificação é auditada e bloqueada com mês fechado.
- Preserva os snapshots sem reescrevê-los. Fechamentos antigos sem lançamentos genéricos e sem vendas de outros canais podem entrar no histórico Frota. Os demais ficam preservados como GENERAL e a tela informa sua existência, sem apresentá-los como fechamento Frota.
- Não elimina registros, não estima a divisão de despesas antigas e não muda os custos de referência por km dos veículos.

## Validação

- 48 testes de domínio/PDF e 46 testes de integração PostgreSQL local (PGlite).
- Casos novos: 501 vendas sem truncamento, canais e permissões, classificação confirmada de lançamento antigo, bloqueio de mês fechado, exclusão da Cegonha, snapshot imutável, migração repetida, histórico misto preservado e PDF de competência/fechamento incorretos recusado.
- TypeScript, ESLint e build de produção verificados. ESLint mantém seis avisos preexistentes, sem erros.
- PDFs reais produzidos pelos endpoints com dados fictícios renderizados e inspecionados; relatório extenso com 35 páginas sem conteúdo fora das margens.
- Não houve validação interativa no navegador: Chromium não estava disponível no ambiente. Recomenda-se conferir os botões e o seletor do fechamento no preview antes do merge.

Não foram executados merge, deploy ou migração em produção.
