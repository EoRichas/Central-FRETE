# Listas expandidas e relatório geral

O relatório geral não tem mais o botão Limpar. Os filtros continuam editáveis e são aplicados por Aplicar filtros.

As seções Veículos da frota e Motoristas mantêm suas setas independentes. Ao expandir, a tabela usa toda a altura necessária para mostrar os registros encontrados, sem o corte anterior de 240px. A navegação vertical passa a acompanhar a página. A rolagem horizontal continua disponível quando necessária.

Validação: 42 testes de componentes passaram; TypeScript, lint do componente alterado e build passaram. Conferência visual com registros fictícios.

## Erro na consulta de comissões dos motoristas

Na investigação de produção, o código do PR112 estava publicado, mas faltavam public.driver_commission_payments e public.fleet_drivers.pix_details. A consulta usa ambos, o que provoca o erro de indisponibilidade.

A migração 20261028191506_driver_commission_payments.sql já faz parte de main e foi testada no PR112, incluindo RLS e o acesso de central_app. Sua aplicação em produção foi bloqueada pela revisão automática por exigir autorização explícita para alterar tabela/campo, política e privilégios. Não houve aplicação parcial nem alteração de pagamentos ou usuários. A correção visual deste PR é independente dessa aplicação.

Após autorização, aplicar a migração existente no projeto Central-FRETE e registrar seu nome no ledger central_schema_migrations na mesma transação. Verificar a consulta real e o acesso de central_app; não registrar baixas fictícias nem alterar comissões existentes. Este PR não adiciona outra migração nem um fallback que oculte a falta da estrutura.
