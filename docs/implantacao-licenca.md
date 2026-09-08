# Central Frete: implantação e migração

Esta alteração foi preparada localmente. Não executa deploy nem mudanças no banco de produção durante o desenvolvimento.

## Preparação

1. Fazer backup do PostgreSQL e testar a migração em uma cópia isolada.
2. Executar `npm ci`, `npm test`, `npm run test:integration`, `npm run lint`, `npm run build`.
3. Publicar inicialmente com `BILLING_ENABLED=false`. Isso mantém acesso e permite completar cadastros antigos, sem inventar CPF/endereço.
4. O `npm start` executa as migrações idempotentes e inicia o Next.js. A nova 003 preserva dados; não remove tabela nem custo existente. Exportar backup antes de qualquer reversão. Reverter o código mantendo as novas colunas é preferível a apagar histórico financeiro.

## Mensalidade

Configure no servidor, nunca no navegador:

- `APP_URL`: domínio HTTPS da aplicação.
- `BILLING_COMPANY_ID`, `BILLING_COMPANY_NAME`: cliente licenciado. Esta instalação é de uma única empresa, abrangendo todos os usuários. Não é um SaaS multitenant compartilhado.
- `BILLING_FIRST_COMPETENCY=2026-10`: primeiro vencimento autorizado pelo proprietário em 05/10/2026. Setembro de 2026 fica liberado, sem cobrança retroativa e sem registrar pagamento fictício. Bloqueio por falta de pagamento somente a partir de 06/10/2026, em Brasília, após ativar o licenciamento.
- `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_COLLECTOR_ID`: credenciais e conta recebedora.
- `MERCADO_PAGO_MODE=test` durante testes; `production` na operação real.
- `BILLING_CHECKOUT_MODE=monthly`: checkout identificado por competência, Pix/cartão conforme disponibilizados pela conta. Aceita antecipação da próxima competência, mantém dia 05 e impede gerar novo checkout para mês quitado. O cliente realiza o pagamento; confirmação, certificado e liberação são automáticos.
- `BILLING_CHECKOUT_MODE=subscription`: usa plano recorrente validado via API. Exige `MERCADO_PAGO_PLAN_ID`. Deve custar 149,99 BRL, ser mensal, dia 05, sem pró-rata. Não modifica automaticamente planos existentes.
- Link fornecido pelo proprietário: https://mpago.la/1kodio9. Não foi possível validar o destino durante o desenvolvimento. Não é usado como prova de pagamento nem como identidade de cliente. Após validar o plano associado, a aplicação usa seu `init_point` oficial.
- Para vincular uma assinatura feita pelo link: o proprietário deve configurar `MERCADO_PAGO_SUBSCRIPTION_ID` e `BILLING_PAYER_EMAIL` após conferir conta/empresa. Um usuário do sistema não pode vincular arbitrariamente uma assinatura de terceiros.
- Não misturar cobrança avulsa e assinatura automática ativa: a aplicação bloqueia esse fluxo para evitar débito duplicado. Antecipação pelo checkout mensal é suportada; antecipação fora do cronograma da assinatura recorrente precisa ser acordada com o provedor antes de ativar esse modo.

No painel do Mercado Pago, configurar notificações `payment` e `subscription_authorized_payment` para `APP_URL/api/billing/webhook`. Usar a assinatura secreta da aplicação correta. O retorno visual do checkout não confirma pagamento.

A integração confere recebedor, moeda, valor bruto, ambiente de teste/produção, referência da competência ou vínculo da assinatura. Pix/cartão dependem da modalidade e da conta do Mercado Pago. A assinatura não é considerada paga apenas por estar autorizada; precisa haver pagamento aprovado. Estornos e reembolsos detectados retiram a quitação. A chave é aleatória e registrada uma vez por competência; sua validade é derivada no servidor, por data e pagamento, não por um segredo enviado pelo navegador.

Mês antecipado fica agendado até 00h do dia 05 em Brasília. Cobrança sem pagamento tem tolerância até o fim do dia 05; bloqueio a partir de 00h do dia 06. Todas as competências vencidas desde o primeiro mês configurado precisam estar quitadas. PDFs são certificados de licença de uso, não certificados ICP-Brasil.

## Avisos e tarefas

- `BILLING_NOTIFY_EMAIL`: Gmail destinatário, a confirmar com o proprietário.
- `RESEND_API_KEY`, `BILLING_EMAIL_FROM`: remetente validado no Resend. A mensagem chega ao Gmail sem conceder acesso à caixa de entrada. Custos/limites do provedor são externos.
- `BILLING_CRON_SECRET`: segredo aleatório (mínimo recomendado 32 caracteres).
- `BILLING_SCHEDULER_ENABLED=true`: processo Node iniciado por `npm start` consulta manutenção a cada 5 minutos. Não requer serviço Cron pago separado em servidor sempre ativo.
- Alternativa portátil: um agendador externo faz POST em `/api/billing/maintenance` com `Authorization: Bearer <segredo>`. Desligar o agendador interno nesse caso.
- Render gratuito pode suspender por inatividade: e-mails e reconciliações podem atrasar. O bloqueio e ativação da competência são conferidos a cada requisição e não dependem do relógio do agendador. Para avisos pontuais, usar serviço sempre ativo ou agendamento externo.
- Falhas de e-mail ficam em fila persistente e não impedem liberar pagamento. O provedor possui janela de idempotência; uma falha de persistência após o envio pode requerer conferência do operador para eliminar duplicidade excepcional.

## Frota e rotas

`GOOGLE_MAPS_API_KEY` habilita Google Routes API (chave somente no servidor). A API deve estar habilitada e ter cota/orçamento definidos na conta. ViaCEP preenche o endereço; Google Routes calcula distância rodoviária para direção comum. Não substitui roteirização para restrições específicas de caminhão. Sem serviço/chave, preenchimento e correção manual continuam disponíveis.

Motoristas existentes permanecem legíveis, mas edição exige CPF válido, nome completo, endereço e telefone. CPF único substitui nome único, permitindo homônimos. Vínculo cadastral opcional: cada motorista tem um veículo preferencial, podendo haver mais de um motorista por veículo. No frete, a seleção permanece ajustável; referências históricas são preservadas.

## Render → Hostinger

Manter GitHub, PostgreSQL e bucket privado do Supabase. Usar Node >=22.13, build `npm ci --include=dev && npm run build`, start `npm start`, porta `PORT` fornecida pelo host e variáveis acima. O antigo `scripts/start-render.mjs` permanece como entrada compatível.

Testar startup, conexão externa com o Supabase, uploads, limites de requisição, processos em segundo plano e chamadas de webhook na Hostinger antes da migração. Atualizar `APP_URL`, notificações do Mercado Pago, URLs de retorno e agendador externo. Trocar domínio somente após validar; manter Render disponível para rollback. Não usar disco efêmero para comprovantes ou certificados.

## Validação antes de ativar cobrança

- Pagamento de teste pendente não libera; aprovado libera; repetição não renova duas vezes.
- Referência, assinatura ou valor incorretos não liberam.
- Conferir cobranças de primeiro mês, dia 05, antecipação e inadimplência com a conta real configurada em ambiente de teste.
- Validar envio ao e-mail confirmado e abertura do PDF.
- Só habilitar `BILLING_ENABLED=true` após aprovar essas condições e o primeiro mês cobrado.

## Verificação local realizada

- 35 testes de domínio/configuração e 6 testes de integração passaram.
- As três migrações foram aplicadas duas vezes em PostgreSQL isolado (PGlite), sem acesso ao banco real.
- Integração verifica anexos por vendedor, restrições do financeiro, assinatura de webhook, duplicidade de notificações, valor incorreto, estorno e bloqueio das APIs.
- TypeScript, ESLint e compilação de produção verificados.
- Revisão visual pendente: o navegador do ambiente bloqueou a prévia local (`ERR_BLOCKED_BY_CLIENT`).
- Mercado Pago, envio de e-mail, Google Routes e Storage reais ainda precisam de homologação com as credenciais do proprietário. Não houve cobrança, envio de e-mail, publicação, migração de produção ou alteração no Render/Supabase.
