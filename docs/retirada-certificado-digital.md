# Retirada do certificado digital

## Comportamento da versão

- A opção Certificado digital, sua página, PDF, preços, alertas e mensagens de suspensão foram removidos.
- As rotas `/api/billing`, `/api/billing/checkout`, `/api/billing/webhook`, `/api/billing/maintenance` e `/api/billing/certificate/[competency]` foram excluídas. A página `/certificado` também deixa de existir. Essas URLs retornam 404 após a publicação.
- O servidor não consulta licença, pagamentos ou vencimentos para autorizar usuários. `/api/me` retorna o usuário autenticado, sem estado de licença.
- Não há criação de checkout, processamento de webhook, reconciliação de pagamentos, emissão de certificado, agendador nem envio de e-mail de cobrança.
- Variáveis antigas, mesmo definidas como `BILLING_ENABLED=true`, não reativam o recurso nesta versão.
- Login, usuários ativos, permissões, recebimentos de fretes, comprovantes, comissões, Frota, viagens e fechamento mensal continuam com suas regras próprias.

## Dados existentes

Não há migração destrutiva nem exclusão de pagamentos. As tabelas `billing_periods`, `billing_payments` e `billing_email_outbox` permanecem privadas e sem consumo pelo aplicativo. Isso preserva o histórico. A migração `003_fleet_billing.sql` é mantida por já ter sido aplicada e também conter estruturas de anexos e pagamento da Frota.

## Encerramento fora do código

1. No ambiente da versão antiga, manter `BILLING_ENABLED=false` e `BILLING_SCHEDULER_ENABLED=false` até publicar a remoção.
2. No Mercado Pago, retirar o endereço de notificações da Central que termina em `/api/billing/webhook`. Conferir as configurações de pagamentos e assinaturas da aplicação correta.
3. Conferir e cancelar, quando existentes, a assinatura da Central e os links ou planos exclusivos dessa cobrança. Desativar o webhook não cancela débitos recorrentes; remover código também não cancela uma assinatura no provedor. Não encerrar planos compartilhados com outros clientes.
4. Desativar qualquer agendamento externo que chame `/api/billing/maintenance`. O agendador interno foi removido do processo de inicialização.
5. Publicar a nova versão e conferir login, navegação, permissões e ausência das URLs retiradas.
6. Remover do ambiente do serviço as variáveis obsoletas `BILLING_*`, `MERCADO_PAGO_*`, `RESEND_API_KEY` e `APP_URL`, se exclusivas desse fluxo. Não excluir credenciais compartilhadas com outros serviços.

Nenhuma dessas operações externas é executada automaticamente por uma migração ou por este documento. Registrar sua conclusão somente após verificar o ambiente correspondente.

## Reversão

Os registros históricos permitem retornar à versão anterior sem reconstruir pagamentos. Ao reverter, manter as duas flags de cobrança desativadas para evitar reativar bloqueios e tarefas. A reversão do código não deve reativar assinaturas no Mercado Pago.

## Validação local

- 39 testes unitários e 11 de integração passaram. A regressão de acesso remove as tabelas antigas numa transação de teste e verifica os cinco perfis com `BILLING_ENABLED=true`, sem chamadas externas. Sessão ausente, conta inexistente/inativa e perfil sem permissão continuam sendo recusados.
- Build de produção com webpack e checagem TypeScript passaram.
- Verificação HTTP local: login 200, sessão ausente 401, página de certificado e cinco endpoints de cobrança 404, inclusive com flags antigas ativadas.
- O lint ainda aponta o erro preexistente `react-hooks/set-state-in-effect` na inicialização do tema em `components/app-shell.tsx`, fora do trecho alterado, e dois avisos preexistentes de navegação. Não houve inspeção visual no navegador nesta entrega.
