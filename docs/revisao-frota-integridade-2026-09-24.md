# Atualização operacional da Frota e Vendas Cegonha

Branch: `feat/fleet-operations-integrity-20260923`. Base: `7b6a2e3`, main após PR #54, novamente conferida antes do envio. Nenhum merge, deploy ou alteração de dados de produção foi realizado nesta entrega.

## Diagnóstico e evidências

Foram revisadas as descrições e decisões dos PRs #31, #32, #33, #34, #35, #48, #50 e #54, junto ao código consolidado na main e às migrations existentes. A última migration do runner era `011_sale_origin_location_type.sql`. O histórico de migrations do Supabase não representa todas as mudanças desse runner; por isso, foram consultadas diretamente as colunas e constraints do banco real.

A consulta ao Supabase confirmou 39 registros em `fleet_vehicle_costs`, de 13 veículos. Também confirmou as FKs restritivas dos comprovantes, a referência venda–frete sem `SET NULL` e as dependências de OS/versões sem cascade. Esses registros reais foram somente consultados.

O erro de carga foi reproduzido com **Postgres.js 3.4.7**, o driver utilizado pela aplicação, conectado ao PostgreSQL do PGlite pelo protocolo de rede. `JSON.stringify(carga)` enviado a `$1::jsonb` chega como string JSON; `$1::text::jsonb` chega como array. O teste prova o comportamento antigo e a correção com um e vários veículos. As constraints de `cargo_vehicles` permanecem intactas.

## Alterações

- Removidos aba e componente Parâmetros, regras de encaixe/retorno, respectivos filtros, payloads e indicadores. Colunas antigas permanecem para preservar histórico.
- Histórico mensal consultável no cadastro de cada caminhão, inclusive pelo Financeiro em modo de leitura. Não há reimportação de registros nem desconto desse histórico no resultado dos fretes.
- Faturamento mensal e comissões apurados no servidor, sem truncar a lista em 500. A aba detalha cliente, caminhão, motorista, data, valor e situação. Comissões mostram os fretes de cada motorista cadastrado.
- Nova apresentação de custo total, resultado e margem dentro do frete, usando a função financeira existente compartilhada pelo backend e pela prévia.
- CEPs completos disparam consulta de endereços e rota rodoviária; a distância é exibida e preenchida. Falha do provedor mantém endereços consultados e permite entrada manual.
- KM inicial/final persistidos em metros inteiros. Backend calcula a distância efetiva, e a constraint protege ordem das leituras e coerência com `distance_meters`. Financeiro não pode alterar esses dados operacionais.
- Exclusão de venda com OS e versões, parcelas, pagamentos, custos e anexos. Um frete vinculado permanece.
- Exclusão de frete com comprovantes. Uma venda vinculada permanece com `fleet_freight_id = NULL`; a carga exibida antes da exclusão é preservada na venda.
- Arquivos excluídos entram em fila durável na mesma transação de exclusão dos metadados. Após commit, a aplicação tenta removê-los do Storage. Falhas permanecem na fila e podem ser reprocessadas por ADMIN; a interface mostra a pendência. Nunca se informa falha da exclusão já confirmada apenas porque a limpeza do arquivo falhou.
- Tipo de local de destino independente da origem em criação, edição, detalhe, novas OS e CSV. Exportação CSV passa a percorrer as páginas, evitando o corte em 500 vendas.
- Condição de pagamento removida do fluxo ativo e documentos renderizados. Coluna e snapshots antigos não são apagados.
- Outras despesas continuam nos cálculos; campo final compacto e centralizado.
- APIs continuam validando permissões. Exclusões de fretes e vendas são restritas ao ADMIN. Financeiro conserva edição financeira; Operacional conserva o acesso operacional anterior.
- Frota separada em tela coordenadora, tabela, modal, cadastros/histórico, faturamento/comissões e aviso de limpeza. Removido seletor inoperante de vínculo fixo motorista–veículo: a migration 005 mantém o vínculo por operação. O cadastro agora mostra os caminhões usados pelo motorista nos fretes do mês.
- Erros de banco exibem mensagens de negócio; SQLSTATE, constraint, query e stack ficam nos logs. Consultas parametrizadas continuam sendo usadas.

## Regras financeiras

`Custo da operação = combustível + comissão do motorista + pedágio + pátio + coleta + entrega + outras despesas + parcelas de custos de viagens históricas, quando existentes.`

`Resultado = valor do frete − custo da operação`.

`Margem % = resultado ÷ valor do frete × 100`; frete de valor zero exibe percentual zero, evitando divisão por zero.

Combustível realizado tem prioridade; valor zero informado é realizado. Sem valor realizado, a operação exibe estimativa ou parcela de viagem histórica, com indicação da origem. Custos compartilhados de viagens antigas continuam sendo distribuídos uma única vez. O histórico mensal do caminhão não integra o desconto do frete.

Faturamento e comissões usam **data de faturamento**, alinhada à receita do fechamento mensal. Operações/listagem e resultado por caminhão continuam por **mês da coleta**, identificado na interface. Comissão exibida é **gerada**, não comprovação de repasse ao motorista. Comissões comerciais de vendedores não entram nesse total.

O fechamento conserva snapshots e tratamento anterior de combustível pendente; estimativa na operação não se transforma automaticamente em despesa realizada no fechamento.

Com as duas leituras preenchidas, `distância efetiva = KM final − KM inicial`. A distância da rota é guardada separadamente. Com uma leitura incompleta, permanece a distância manual/calculada informada.

## Migration nova

`supabase/migrations/20260923220518_fleet_operation_integrity.sql`, criada pela CLI e acrescentada ao runner `scripts/migrate-postgres.mjs`. Executada depois da 011.

Inclui as três colunas de distância/hodômetro, destino da venda, novas regras de FKs, fila de limpeza com RLS/revogação de acesso público, triggers de captura de arquivos e preservação de carga ao desacoplar venda. Usa transação, lock consultivo e timeout de lock de 5 segundos. Não modifica migrations antigas, não apaga histórico e não remove a validação JSON.

A migration deve ser aplicada no ambiente de homologação antes de iniciar o código novo. Em timeout de lock, corrigir a concorrência de implantação e repetir. Para rollback do aplicativo, manter a estrutura aditiva; não apagar a fila ou histórico. A restauração de políticas antigas de exclusão exige uma migration própria e revisão dos registros criados desde a publicação.

## Arquivos principais

- `lib/server/d1.ts`: mensagens seguras e diagnóstico de cada statement.
- `app/api/fleet/freights/*`, `app/api/sales/*`: gravação, hodômetro, destino e exclusões.
- `lib/server/fleet.ts`, `lib/domain/fleet.ts`, `lib/domain/fleet-distance.ts`: consultas, totais e regras comuns.
- `lib/server/storage-cleanup.ts`, `app/api/storage-cleanup/route.ts`: limpeza e nova tentativa restrita ao administrador.
- `lib/server/service-orders.ts`, `lib/server/service-order-pdf.ts`: snapshots e documentos.
- `components/fleet-screen.tsx`, `fleet-assets.tsx`, `fleet-freight-modal.tsx`, `fleet-freight-table.tsx`, `fleet-billing.tsx`, `fleet-vehicle-history.tsx`: interface modular.
- `tests/integration/database.test.ts`, `postgres-driver.test.ts`, `tests/fleet-distance.test.ts`, `tests/database-errors.test.ts`: regressões.

## Validação

- `npm test`: 44 testes aprovados.
- `npm run test:integration`: 26 testes aprovados, incluindo driver real Postgres.js sobre protocolo PostgreSQL.
- TypeScript, build de produção Next.js e `git diff --check`: aprovados.
- ESLint: sem erros; seis avisos anteriores em login, configuração inicial e navegação do app.
- Migrations executadas duas vezes em banco local e nova migration reaplicada após inserção de históricos, sem perda desses registros.
- Testados criação/edição de vendas e fretes com cargas, restrições de perfis, OS e versões, exclusões com e sem vínculo, comprovantes, recuperação de falha do Storage, margem de 62%, distância realizada, destino independente, exportação, faturamento com 601 fretes e fechamento mensal.
- Chamadas externas de CEP/rota e Storage usam respostas controladas nos testes; não houve exclusão real de arquivos de produção.

## Pendências para homologação

O navegador Playwright/Chromium não pôde iniciar neste ambiente: `socket() failed: Operation not permitted`. Portanto, **a inspeção visual e os testes de interação desktop/celular, claro/escuro não foram concluídos**. O PR permanece em rascunho por esse motivo.

Validar a configuração `GOOGLE_MAPS_API_KEY` e uma rota real no Render/homologação, além do ciclo de upload/exclusão em um bucket de teste do Supabase. A ausência de chave não é contornada com uma distância fictícia: a UI permite informar manualmente. Nenhuma chave nova foi criada, nenhum serviço pago foi provisionado e nenhuma configuração de produção foi alterada.

A fila é processada após exclusões e por nova tentativa explícita do ADMIN; esta entrega não provisiona um worker nem um agendamento recorrente. A leitura completa dos fretes para preservar rateios de viagens históricas permanece no backend; paginar a interface sem recortar os totais pode ser uma melhoria posterior de escala.
