# Vendas Geral e fechamento mensal Cegonha

Continuação do PR #69, na branch `feat/seller-commission-access-20260930`.

## Referência e decisões

Referência consultada: EoRichas/Rota-Proxima, commit `e48fd67`, relatório de coletas em `rota-proxima/static/app.js` e PDF em `rota-proxima/server.py`. A adaptação aproveita a sequência filtros, indicadores, comparativo por comercial, registros detalhados e exportações. A identidade, os controles e as tabelas continuam sendo os do Central. A consulta ao catálogo Refero estava indisponível; a referência fornecida pelo usuário e a interface existente orientaram a implementação.

A imagem de 30/09 às 17:12 pede vendedor junto às datas na tabela da Frota. A coluna passa a apresentar vendedor, coleta, entrega e faturamento.

## Vendas Geral

- Todo o histórico é incluído inicialmente. Filtros: início, fim, canal e vendedor.
- Canal reúne vendas Cegonha, vendas Frota sem vínculo e fretes operacionais Frota. A venda Frota vinculada a um frete não entra novamente.
- Base temporal: data da venda para registros comerciais; data de coleta para fretes. O faturamento continua com seu filtro próprio e não altera esta base.
- Custos da Frota usam o mesmo cálculo da tela de fretes, incluindo rateio de viagens e combustível estimado quando não há realizado. O relatório identifica os resultados parciais.
- Indicadores, comparativo por vendedor e relação completa usam o mesmo conjunto filtrado. A tabela mostra 100 registros por página; os totais e exportações incluem todas as páginas.
- PDF e CSV usam os mesmos filtros e permissões da consulta. CSV é compatível com planilhas, separado por ponto e vírgula, com BOM e proteção contra fórmulas em campos textuais.
- Vendedores veem somente vendas associadas ao seu ID. Homônimos não compartilham acesso. Comissões detalhadas aparecem apenas para administrador e vendedor; financeiro e gerência recebem custos consolidados.
- Percentuais são os preservados nas vendas/fretes, conforme a primeira parte deste PR, sem recalcular históricos pela taxa atual do cadastro.

## Fechamento mensal

Novo caminho: **Vendas Cegonha → Fechamento mensal** (`/vendas/fechamento`). Disponível para administrador, financeiro e perfil legado de gerência, como o fechamento da Frota.

A competência inclui somente `freight_sales.sale_channel = CEGONHA`. Receita, custos com comissão e lançamentos manuais são próprios desse canal. Não inclui fretes, viagens, custos de veículos ou lançamentos Frota/GENERAL. Os registros GENERAL antigos permanecem preservados sem atribuição automática a um canal.

Permite consultar meses anteriores, salvar fechamento após conferência, consultar a versão preservada, baixar PDF, lançar receitas/custos adicionais e reabrir com motivo. Custos pendentes impedem salvar. Um fechamento é capturado em um único comando SQL, com trava transacional e auditoria. A reabertura preserva o histórico; IDs de outro canal ou competência são recusados.

O relatório geral não substitui fechamento contábil nem mede recebimentos em caixa. As margens de fretes com estimativas podem mudar até o custo realizado ser registrado.

## Banco e publicação

Migração adicional: `supabase/migrations/20260930172047_cegonha_monthly_scope.sql`, registrada no runner `npm run migrate`. Expande apenas as restrições de escopo das duas tabelas mensais para aceitar CEGONHA. Não transfere dados antigos nem altera fechamentos da Frota.

Antes de publicar o PR, executar `npm run migrate` com a configuração do banco apropriado. O runner inclui também a migração anterior de comissões do PR #69. As migrações não foram aplicadas por esta tarefa no banco de produção.

## Verificação

A suíte de integração verifica consolidação sem duplicação, filtros, homônimos, restrição por usuário, ocultação de comissão, exportações, escopo dos fechamentos, custos pendentes, bloqueio de edição, versões preservadas e rejeição de IDs entre canais. As migrações são executadas duas vezes na base de testes.

Resultado: 59 testes de integração e 49 de domínio/PDF/sessão aprovados. Build e TypeScript aprovados; lint sem erros e com seis avisos já existentes. PDFs renderizados e inspecionados. Chromium/Playwright local com respostas sintéticas verificou filtros, exportação com os mesmos parâmetros, limpar filtros, consulta de versões e reabertura, permissões e telas em desktop/celular. As regras de banco foram testadas separadamente em PGlite; não houve validação autenticada em produção.

## Correção solicitada em 30/09, às 14:41

A aba foi renomeada para **Vendas Geral**, com endereço `/vendas-gerais`. O endereço antigo `/relatorios` apenas redireciona; não há uma segunda opção no menu ou tela antiga disponível. Foram retirados da tela e do PDF os blocos antigos de resultado por cliente e composição de despesas. Permanecem a consulta geral, os filtros, os indicadores das vendas, o comparativo de vendedores/comissões e as exportações do conjunto selecionado. O fechamento mensal continua dentro de Vendas Cegonha, exclusivamente com dados Cegonha. Nenhuma migração adicional neste ajuste.
