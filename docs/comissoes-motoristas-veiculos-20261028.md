# Comissões dos motoristas e controles de veículos

- Cada veículo transportado tem um X. Remove somente aquela linha; na última linha, limpa os campos para permitir corrigir o lançamento, preservando a exigência atual de ao menos uma unidade de carga. Fica oculto quando a carga não pode ser editada.
- As listas de veículos cadastrados e de motoristas ficam empilhadas, inicialmente recolhidas. Cada cabeçalho tem uma seta própria; buscas, cadastro, edição e rolagem sem scrollbar permanecem dentro da seção expandida.
- Comissão motoristas agrupa as vendas por motorista, como Comissão vendedores. A seta da venda abre Pagamento da comissão com PIX, Em aberto/Pago e data. A situação pertence ao frete escolhido, sem alterar outras comissões, o recebimento do cliente, a comissão do vendedor ou o valor calculado da operação.
- A consulta continua incluindo vendas pagas e em aberto pelo cliente, conforme esclarecimento do usuário. Somente ADMIN dá baixa, seguindo a permissão existente em Comissão vendedores; os demais perfis já autorizados mantêm consulta.
- PIX é lembrado para o motorista cadastrado; cada pagamento guarda seu próprio PIX. Registros sem motorista cadastrado continuam com pagamento individual pelo ID do frete, sem associar pessoas apenas pelo nome.

## Banco e publicação

A migração `20261028191506_driver_commission_payments.sql` adiciona PIX ao cadastro do motorista e a tabela de pagamentos por frete. É idempotente, não marca comissões antigas como pagas e está no runner de migrações. RLS habilitada, sem grants para PUBLIC/anon/authenticated; o backend central_app tem a política e os privilégios necessários. A API valida ADMIN e grava pagamento, PIX e auditoria na mesma transação, bloqueando o frete durante a alteração.

A migração precisa preceder a publicação do código. O start padrão executa o runner; instalações com CENTRAL_FRETE_MIGRATE_ON_START=false devem executar `npm run migrate` com a conexão de migração antes do deploy. Nenhuma alteração de produção foi executada nesta preparação.

## Validação

130 testes unitários/componentes e 112 de integração passaram. Regressão adicional com a migração reaplicada e o papel restrito confirmou leitura e baixa sem DDL. Tipos, lint dos arquivos alterados e build passaram. Inspeção visual dos componentes reais com dados fictícios e teste das duas setas. Remoção de uma linha intermediária, preservação de FIPE dos demais veículos, limpeza da última linha e modo sem edição foram exercitados.
