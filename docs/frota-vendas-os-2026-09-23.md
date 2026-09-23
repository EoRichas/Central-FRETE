# Frota, vendas e Ordem de Serviço

Base: main `20f6a41517a78456aa47f09c3e9f92861ae8a1ff`. Esta alteração não executa migração nem publica em produção.

## Fluxos e fontes de verdade

- Frota: `fleet-screen` → APIs `fleet/freights` → validação centralizada → `fleet_freights` → domínio `fleet`/`fleet-results` e SQL mensal.
- Venda: `sale-form-screen` → APIs `sales` → transação PostgreSQL (venda, parcela, custos e auditoria).
- OS: detalhe da venda → `vendas/[id]/os` → API `service-order` → identidade 1:1 e versões imutáveis → PDF A4.
- As permissões existentes foram mantidas. Financeiro edita valores da Frota, sem alterar a carga. O vínculo de uma venda com a Frota é definido pelo administrador, que possui acesso a ambas as áreas. Vendedor só emite/consulta OS das vendas às quais já tem acesso; Operacional não acessa OS comercial.

## Veículos e combustível

`cargo_vehicles` guarda uma lista ordenada com modelo, placa e identificação opcional. Quantidade é o tamanho da lista, de 1 a 100 unidades por requisição. Não há campos fixos repetidos. Registros sem a lista usam o modelo/placa legado como uma unidade; a migração não modifica esses registros.

Campos persistidos:

| Interface | Banco | Unidade e uso |
| --- | --- | --- |
| Litros abastecidos | fuel_liters_milli | Milésimos de litro, até três casas decimais |
| Valor bomba | fuel_pump_amount_cents | Valor monetário informado na bomba, em centavos |
| Valor pago combustível | actual_fuel_cost_cents | Custo efetivo, em centavos |

Litros e valor bomba são evidências do abastecimento. Não são multiplicados nem usados para sobrescrever o valor pago. Apenas `actual_fuel_cost_cents` entra como combustível realizado. Vazio mantém estimativa por km, ou a parcela da viagem histórica. Zero é realizado e nunca aciona o fallback. Valores com precisão excessiva são rejeitados.

Para viagens históricas, diesel, pedágio e outros custos compartilhados são divididos igualmente entre os fretes vinculados. Centavos restantes vão aos primeiros IDs em ordem lexical, igual no TypeScript e SQL. Informar combustível realizado em um frete substitui apenas sua parcela histórica de diesel. As demais parcelas continuam preservadas. Isso mantém a soma dos resultados individuais igual ao resultado da viagem, sem somar combustível estimado e realizado. Valores históricos da viagem não são alterados. Viagens sem fretes continuam compondo o mensal com seus custos históricos.

Margem de contribuição mantém o conceito anterior: receita menos comissão/despesas diretas. Resultado operacional também desconta combustível e transporte. Indicadores gerais e por caminhão usam esse resultado. A base antiga de custo/km continua disponível internamente, sem descontá-la novamente.

## Interface simplificada

A aba Viagens, seu componente, a seleção de novas viagens no frete e os links de navegação para ela foram removidos. Fretes já vinculados mostram uma indicação histórica. APIs, tabelas e vínculos necessários aos cálculos permanecem.

Fechamento mensal apresenta somente Composição do resultado. A composição usa a apuração atual; históricos fechados e suas versões continuam intactos no banco/API. Receitas/custos diretos seguem faturamento; custos de viagens históricas seguem a data da viagem. Estimativas não viram despesa realizada: combustível pendente deixa o resultado identificado como parcial dentro da própria composição. Lançamentos complementares existentes continuam entrando no cálculo, sem editor na interface.

Parâmetros mantém somente Combustível e operação. Bases e editores inferiores foram retirados, preservando dados e cálculos internos.

## Numeração anual

Formato `AAAA-sequência`, começando em 1 para anos sem números no novo padrão. Ano definido pela data da venda informada no primeiro registro. A mudança de ano dispensa alteração de código. Números legados continuam inalterados.

Trigger PostgreSQL usa UPSERT em `sale_number_counters`, dentro da mesma transação da venda. A atualização da linha do ano serializa concorrência. Falha/rollback também desfaz incremento; excluir venda não reutiliza número. Não é usada sequence `nextval`, pois ela consome números mesmo após rollback.

API de criação não aceita número manual; edição rejeita mudança, e o banco também protege a imutabilidade. Corrigir a data de uma venda já registrada não renumera a venda. Importações históricas continuam aceitando identificadores originais; importação de número no novo formato avança o contador correspondente.

Consulta individual passou a filtrar pelo ID no SQL: vendas antigas fora dos primeiros 500 registros também podem gerar OS. Ordenação foi adaptada para números legados e anuais.

## Identidade, versão e PDF da OS

`service_orders` contém só ID, venda única, autor e data. `service_order_versions` contém versão, autor, data e snapshot dos campos efetivamente impressos. Não replica custos internos, comissões, pagamentos ou anexos desnecessários.

A primeira emissão cria versão 1. Repetir emissão sem mudanças retorna a mesma versão. Edição posterior da venda, cliente ou carga marca a OS como desatualizada; o usuário gera nova versão explicitamente. As anteriores continuam consultáveis e imprimíveis. A numeração de versões é serializada pelo bloqueio da venda. Todos os dados do documento são lidos por uma consulta PostgreSQL consistente. Venda com OS não pode ser excluída pelo endpoint existente, preservando a rastreabilidade.

Vendas independentes têm sua própria lista de veículos. Uma venda opcionalmente vinculada ao frete consulta a carga diretamente na Frota. Não se preenchem novamente os veículos para gerar OS. Valor e condições comerciais vêm da venda. O vínculo também impede excluir o frete referenciado.

PDF usa logo oficial do repositório, azul da Central, fontes Noto Sans incorporadas, páginas A4, quebra de linhas e paginação. `pdf-lib`, `@pdf-lib/fontkit` e `@fontsource/noto-sans` são dependências fixadas para gerar o PDF sem navegador externo e garantir fontes consistentes. Arquivos de fonte e logo constam no tracing do build. Caracteres fora da fonte são representados por `?`; português e os símbolos usados no documento são suportados.

Nome e logo da Central já existem no projeto. CNPJ/endereço/contato institucionais não constavam no cadastro: configuração opcional `CENTRAL_EXPRESS_DOCUMENT`, `CENTRAL_EXPRESS_ADDRESS`, `CENTRAL_EXPRESS_CONTACT`. Não foram inventados nem copiados da empresa do PDF de exemplo. A identidade configurada é preservada no snapshot de cada nova versão.

## Acesso comercial e edição de despesas

Vendedores podem consultar a área de Prestadores em modo somente leitura. A API aplica a mesma regra: ADMIN, GERENCIA, VENDEDOR e FINANCEIRO podem consultar; alterações continuam exclusivas do ADMIN.

No detalhe da venda, `NOTA_FISCAL_IMPOSTO` e `OUTRAS_DESPESAS` integram as categorias editáveis pelo ADMIN ou FINANCEIRO. O botão de edição e o endpoint usam a mesma lista de categorias. Dados PIX continuam disponíveis apenas para despesas de coleta, entrega e pátio, evitando solicitar informação de pagamento em categorias que não são prestadores ou pagamentos operacionais.

## Local de origem

O cadastro da venda permite classificar o local de coleta como `PÁTIO`, `PORTA` ou `PONTO DE ENCONTRO`. O valor é armazenado em `freight_sales.origin_location_type`, é opcional para compatibilidade com registros antigos e, quando informado, aparece no detalhe da venda e na OS. A alteração usa a migração `011_sale_origin_location_type.sql`.

## Migração, validação e reversão

As novas migrações `010_fleet_cargo_sales_orders.sql` e `011_sale_origin_location_type.sql` estão registradas no runner existente. Nenhuma migração anterior foi editada. Tabelas novas têm RLS e não concedem acesso a anon/authenticated. Trigger usa SECURITY INVOKER. Não foram executadas alterações no banco real.

Antes da implantação autorizada: backup, aplicar migração em homologação e validar cadastro, edição, OS e resultados com registros representativos. Não reverter ao código anterior sem manter a consulta compatível com `AAAA-sequência`; a versão anterior convertia o número completo para inteiro. Em falha, preferir correção progressiva e preservar tabelas, contadores e versões. Não há migration de rollback destrutiva.

Validação automatizada: testes de domínio, integração em PostgreSQL/PGlite, duas execuções das migrations, requisições simultâneas, rollback após número gerado, permissões, legado, combustível zero/realizado, rateio sem duplicação, vínculo Frota, OS idempotente e histórica, PDF com múltiplas páginas, TypeScript, lint e build. PGlite serializa conexões internamente; isso não substitui um teste de carga com conexões PostgreSQL independentes em homologação.

Revisão visual: PDF renderizado e inspecionado. Tokens de claro/escuro, quebra de colunas em até 680 px, labels, foco e ações revisados no código. O navegador disponível bloqueou localhost com ERR_BLOCKED_BY_CLIENT; a conferência visual interativa das telas em desktop/celular continua pendente. Nenhuma homologação foi publicada para contornar essa limitação.
