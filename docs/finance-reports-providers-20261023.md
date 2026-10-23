# Financeiro, prestadores e relatórios — 23/10/2026

## Fluxos entregues

- Pagamento de frete pode ser salvo como Pago sem comprovante. Quando informado, o comprovante precisa pertencer ao frete.
- Financeiro oferece baixa de 1 a 50 vendas do mesmo cliente cadastrado, nos filtros consultados. Quitação do saldo restante, data e forma de pagamento comuns. Clientes homônimos não são agrupados por nome. Fretes vinculados usam a operação original, uma vez. Comprovantes opcionais continuam disponíveis nos detalhes de cada venda.
- Leituras, validações, bloqueios de registros, pagamentos e auditoria da baixa compartilham uma transação. Falha reverte o lote inteiro. A chave da solicitação permite repetir com segurança após perda de resposta. Saldo alterado exige atualizar a consulta.
- Baixa de comissão usa origem + ID da venda, e não vendedor + mês. A tela informa o número da venda no diálogo. ADMIN mantém a administração dos pagamentos de comissão. Status históricos existentes são copiados sem presumir quais pagamentos antigos foram incorretos.
- Fretes sem responsável podem receber vendedor na Identificação: ADMIN/FINANCEIRO escolhem um vendedor ativo; OPERACIONAL pode atribuir a si próprio. Um vendedor existente não é trocado. Atribuição ao frete também atualiza seu vínculo comercial.
- Distância, Pedágio e Motorista/Comissão ficam na mesma linha, adaptando-se ao layout móvel existente.
- Identificação aceita vários prestadores pelo botão +. A seção Prestadores após os custos permite definir coleta, entrega ou outro serviço e o valor combinado de cada lançamento. O nome de referência do cadastro acompanha o prestador. Valores são informados no frete, sem supor uma tabela de preços inexistente.
- Serviços de prestadores compõem custos, prévia, margem e fechamento da Frota. Valores avulsos antigos permanecem intactos; não repetir a mesma despesa nos dois locais. Relatório por transportador mostra valores por venda e totais separados de coleta, entrega e outros serviços, pelo período de coleta.
- Relatório de vendas da Frota aceita cliente específico ou Todos os clientes, preservando o período de criação em São Paulo e o escopo de acesso por ID. Observações das OS continuam vinculadas às vendas correspondentes.
- Relatórios da Frota, Vendas Geral e prestadores exportam Excel real (.xlsx), com números monetários, filtros, cabeçalhos fixos e totais. Textos de usuários são células de texto, nunca fórmulas executáveis. `fflate` 0.8.3, fixado no lockfile, fornece o empacotamento ZIP do formato.
- O relatório de cobrança usa o cabeçalho completo apenas na primeira e última página. Páginas intermediárias usam o espaço superior para a tabela, preservando títulos das colunas e paginação. Observações longas continuam nas páginas seguintes.
- Prestadores e valores entram nas exportações de cobrança quando marcada a opção correspondente. O relatório por transportador possui exportação própria em PDF e Excel.
- Frete retorno é uma marcação informativa, sem alterar custos ou preço.

## Numeração anual

Números existentes e OS emitidas não são renumerados. Em 2026, a sequência atual continua. A partir de janeiro de 2027 (fuso America/Sao_Paulo), vendas e fretes novos compartilham um contador por ano: 2027-1, 2027-2; em 2028, 2028-1. O ano identifica cada sequência e evita colisões. Espelhos comerciais herdam o identificador do frete original, inclusive ao vincular uma venda de ano anterior. Reservas concorrentes e transações revertidas são verificadas no banco de testes.

## Migração e publicação

Aplicar `supabase/migrations/20261023142114_finance_reports_providers_annual_numbers.sql` antes de publicar o código. O runner de migrações já inclui o arquivo. A migração adiciona campos e tabelas, preserva o controle antigo de comissões, copia suas baixas existentes e altera os gatilhos de numeração para a virada anual. RLS permanece ativa, sem grants a anon/authenticated; o papel central_app recebe somente os acessos necessários.

Executar a migração com o proprietário do schema, usando a conexão de migração. Criar snapshot/backup antes da aplicação, confirmar a reaplicação e conferir os registros antigos. Este PR prepara e testa a migração localmente; não modifica o banco de produção.

Em caso de problema após publicar, preferir correção adiante. As novas colunas/tabelas podem permanecer numa reversão de código, mas custos de prestadores não devem voltar a ser calculados pela versão antiga. Uma reversão do código de comissões também não deve descartar pagamentos individuais já registrados. Não apagar os novos dados nem renumerar documentos para fazer rollback.

## Validação

- Testes de regressão de componentes/domínio e integração PostgreSQL com rede externa desabilitada nos laboratórios de autenticação.
- Lote com saldo parcial, homônimos, repetição, concorrência e rollback após erro de auditoria; isolamento das comissões; vínculo de vendedor; custos e relatórios de prestadores; filtros por cliente e período; grants e numeração anual.
- PDF renderizado e conferido na primeira, intermediária e última página; observações extensas e cinco vendas por página quando o texto permite.
- Excel aberto com leitor independente para verificar valores numéricos, fórmula/cache dos totais, células de texto, filtros e cabeçalho fixo.
- TypeScript, lint dos arquivos alterados e build de produção.
