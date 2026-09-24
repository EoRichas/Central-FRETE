# Margem por frete, resultado de viagem e fechamento mensal

## Origem e imagem de login

Implementação baseada na `main` em `4f2af19`, que já contém o PR #47 da branch `fix/login-original-png-20260917`. Não existia uma branch remota chamada exatamente `login` na consulta realizada em 17/09/2026.

A imagem aprovada, sem formulário ou retângulo branco desenhado, substitui `public/central-login.png`. O formulário HTML continua funcional. A referência possui uma nova versão de cache. A imagem gerada foi copiada sem edição adicional; nenhuma mudança na autenticação foi feita.

## Uso

1. Em Frota > Fretes, registre a receita e os custos específicos do veículo transportado: comissão do motorista, pátio/recebimento, coleta, entrega e outros custos diretos.
2. Para uma carga com vários veículos, crie uma viagem em Frota > Viagens. Informe o caminhão, motorista, data de apuração e custos realizados de diesel, pedágio e outros custos compartilhados.
3. Edite cada frete transportado e selecione a mesma viagem. O caminhão e o motorista devem coincidir. Diesel e pedágio não podem ser lançados novamente no frete vinculado. Valores de comissão permanecem por frete; se houver uma comissão total da viagem, distribua seu valor entre os fretes sem repetir o total em cada um.
4. Em Frota > Fechamento mensal, confira os fretes faturados, custos e lançamentos complementares. Inclua despesas fixas, outros custos variáveis e receitas de outras áreas que ainda não estejam representadas em Vendas/Fretes ou na Frota.
5. Confirme a conferência e feche o mês. Para ajustes, reabra com motivo e feche novamente. A versão anterior permanece no histórico.

## Regras

- Margem de contribuição do frete = receita do veículo transportado menos comissão do motorista e despesas diretas desse veículo.
- Resultado operacional da viagem = receitas de todos os fretes vinculados menos todas as despesas diretas e os custos compartilhados da viagem, contados uma vez.
- Frete avulso: o resultado operacional também desconta seu diesel e pedágio. Enquanto o diesel realizado não foi informado, a tela operacional usa a estimativa dos parâmetros. Essa estimativa nunca vira despesa realizada no fechamento.
- Resultado mensal = receitas menos custos variáveis menos custos fixos. O histórico de custo por km é mantido apenas para consulta e não é lançado automaticamente como despesa.
- Valores monetários são armazenados em centavos. Zero realizado de diesel difere de diesel ainda não informado.
- Uma viagem pode existir antes de ter fretes. Seus custos realizados entram no mês mesmo sem receita vinculada. Viagens com fretes não podem ser excluídas, nem ter caminhão/motorista alterados de forma incompatível com esses fretes.

## Competência e abrangência

O filtro de Fretes/Visão geral continua usando o mês da coleta. A aba Viagens usa a data de apuração da viagem e sempre mostra todos os seus fretes, inclusive se coletados em meses diferentes.

No fechamento, receitas e custos diretos dos fretes entram no mês da **data de faturamento**. Os custos compartilhados de uma viagem entram no mês da **data de apuração da viagem**. Uma viagem faturada em outro mês pode, portanto, gerar custos em um mês e receita em outro. Essa separação é explícita na tela.

Fretes sem data de faturamento ficam fora da receita mensal e aparecem como pendência informativa quando coletados no mês selecionado. Fretes avulsos faturados sem diesel realizado impedem o fechamento. O operador deve informar inclusive zero quando não houve esse custo.

A integração automática soma **Vendas/Fretes + Frota**, conforme a confirmação de que são receitas de cadastros distintos. Vendas usa sua competência e inclui os custos cadastrados e a comissão de cada vendedor, arredondada por venda. A Frota mantém faturamento, combustível realizado e custos de viagens pelas regras acima. A consulta considera todas as vendas da competência, sem o limite de 500 da listagem. Vínculos comerciais para consultar a carga não eliminam automaticamente receitas de nenhum dos cadastros.

Receitas ou despesas complementares já cadastradas continuam preservadas. Se alguma delas repetia totais de Vendas informados manualmente, deve ser conferida e corrigida pelo responsável para evitar duplicação; a tela apresenta esse aviso. Vendas com custos pendentes deixam o resultado identificado como parcial. O Financeiro e a Frota exibem a mesma composição mensal.

Fechamentos novos preservam também os totais de Vendas. Versões anteriores sem esse campo continuam com seus valores originais, identificadas como anteriores à consolidação; não se recalculam retroativamente. A atualização não cria tabelas ou migrações e não altera as regras de fechamento/reabertura.

## Histórico, concorrência e acesso

O fechamento grava uma cópia consistente dos dados em uma única instrução SQL. Lançamentos complementares, fechamento e reabertura compartilham um lock transacional por competência. Cada mudança e sua auditoria são atômicas. Só um fechamento vigente é permitido por mês.

A operação de fretes e viagens continua permitida depois do fechamento. Se os dados de origem mudarem, a tela informa a divergência e mantém os valores fechados. A nova apuração só se torna a versão vigente após reabrir e fechar novamente.

Administração e Gerência gerenciam viagens. Administração, Gerência e Financeiro gerenciam o fechamento mensal. Vendedores e Operacional não acessam o endpoint mensal. As novas tabelas têm RLS ativo e nenhum grant para `anon` ou `authenticated`; o acesso permanece nas rotas autenticadas do servidor.

## Implantação

Nenhuma alteração foi aplicada à base real nesta entrega.

Antes de implantar, obtenha backup pelo procedimento operacional existente. Execute `npm run migrate` com a configuração do ambiente de destino. O executor passa a incluir:

- `006_fleet_vehicle_cost_average_flag.sql`, necessária à leitura já existente da base histórica;
- `008_fleet_results.sql`, que adiciona viagens, despesas diretas dos fretes e histórico mensal.

A migração é aditiva e idempotente. Não altera valores existentes nem vincula fretes históricos automaticamente. Campos de despesa direta começam em zero, diesel realizado fica pendente e o vínculo de viagem fica vazio. Não inclui a migração de carga de dados reais `007_seed_fleet_vehicle_cost_base.sql`.

Para reverter o código, as colunas/tabelas novas podem ser mantidas sem perda de informação. Não apagar essas tabelas depois de lançamentos reais. Versões anteriores não conhecem o modelo de viagem, portanto seu uso para novas operações após um rollback exige reconciliação operacional antes de retomar lançamentos.

## Validação

- 54 testes unitários passaram.
- 12 testes de integração passaram em PostgreSQL local via PGlite, incluindo migrações executadas duas vezes, vínculos, custos não duplicados, permissões, fechamento, reabertura, preservação do histórico e auditoria.
- Build de produção passou com `npm run build -- --webpack`.
- Os arquivos alterados passam na checagem de lint. O lint global permanece com um erro anterior em `components/app-shell.tsx`, por `setState` dentro de um efeito, além de avisos preexistentes.
- A inspeção visual no navegador não foi concluída: o navegador remoto retornou `net::ERR_BLOCKED_BY_CLIENT` ao tentar acessar a prévia local. O login foi conferido por caminho, checksum e resposta HTTP; isso não substitui validação visual em diferentes telas.

## Consolidação de Vendas — 24/09/2026

A consolidação foi adaptada à main após o PR #54, preservando sua interface simplificada, combustível realizado, vínculos de carga e Ordens de Serviço. Não reaplica as telas antigas de viagens nem altera o login, já atualizado no repositório.

Validação desta atualização: 43 testes unitários, 19 de integração em PGlite, build de produção e lint dos arquivos alterados aprovados. O teste de regressão usa 501 vendas, múltiplos custos na mesma venda, comissão por venda, um frete faturado da Frota, custo fixo e edição posterior ao fechamento. A interface reutiliza o painel existente; não foi feita nova inspeção interativa em navegador. Nenhuma migração ou alteração em produção foi executada.
