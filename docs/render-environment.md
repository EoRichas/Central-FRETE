# Variáveis do Render — Central Frete

O primeiro vencimento autorizado é **05/10/2026**, no valor de **R$ 149,99**. Setembro de 2026 fica liberado, sem cobrança retroativa. O dia 05 inteiro é permitido; o bloqueio ocorre no dia 06, no fuso America/Sao_Paulo, caso outubro continue pendente. Pagamento antecipado agenda a chave de outubro para 05/10.

Em 08/09/2026 foram salvas no serviço Central-FRETE, preservando as demais variáveis:

```dotenv
BILLING_FIRST_COMPETENCY=2026-10
BILLING_ENABLED=false
```

O envio da branch/PR não publica o código em produção. O Render acompanha a branch `main`; o novo licenciamento só estará disponível após integrar e publicar a alteração. `BILLING_ENABLED=false` mantém o acesso liberado até concluir a configuração e homologação.

## Onde configurar

[Render — serviço Central-FRETE](https://dashboard.render.com/web/srv-da6tindg1s2s73aieoh0) → **Environment**. Cadastre/edite as variáveis, preservando as atuais. Use **Save only**, quando disponível, para preparar valores; publique a versão validada depois. [Documentação do Render](https://render.com/docs/configure-environment-variables).

## Mercado Pago: receber a mensalidade

| Variável | Valor/origem |
|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token da aplicação na conta que receberá os R$149,99. Para pagamentos reais, usar credencial de produção. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Assinatura secreta da seção Webhooks dessa mesma aplicação. |
| `MERCADO_PAGO_COLLECTOR_ID` | ID numérico do usuário/conta recebedora do Mercado Pago. Deve ser conferido na conta/API, e não confundido com o ID da aplicação ou do plano. |
| `MERCADO_PAGO_MODE` | `test` na homologação, com as credenciais correspondentes; `production` para pagamento real. |

Acesse **Mercado Pago Developers → Suas integrações → sua aplicação → Credenciais**. Esta implementação usa checkout hospedado; não requer Public Key, Client Secret ou dados de cartão no servidor da Central Frete. [Credenciais oficiais](https://www.mercadopago.com.br/developers/pt/docs/credentials).

Configure no Mercado Pago o webhook de pagamento para:

```text
https://central-frete-1l01.onrender.com/api/billing/webhook
```

Selecione notificações de **Pagamentos** (`payment`). No modo de assinatura, incluir **Pagamentos autorizados de assinaturas** (`subscription_authorized_payment`). Copie a assinatura secreta para a variável acima. A página de retorno do checkout e um comprovante anexado não liberam a licença: o servidor consulta o pagamento no Mercado Pago. [Configuração de Webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/webhooks).

## Configuração da licença

```dotenv
APP_URL=https://central-frete-1l01.onrender.com
BILLING_COMPANY_ID=central-frete
BILLING_COMPANY_NAME=Central Frete
BILLING_FIRST_COMPETENCY=2026-10
BILLING_CHECKOUT_MODE=monthly
BILLING_ENABLED=false
BILLING_SCHEDULER_ENABLED=false
```

`BILLING_COMPANY_NAME` é o nome exibido no certificado; ajuste para o cliente licenciado. `BILLING_COMPANY_ID` é um identificador fixo desta instalação; não altere depois de começar a receber pagamentos.

No modo **monthly**, o cliente abre o checkout e paga por Pix/cartão conforme os meios liberados pelo Mercado Pago. A confirmação, o desbloqueio e o certificado são automáticos. O débito mensal no cartão não é iniciado automaticamente nesse modo.

Para **débito recorrente**, validar primeiro o plano e usar `BILLING_CHECKOUT_MODE=subscription` com:

| Variável | Valor |
|---|---|
| `MERCADO_PAGO_PLAN_ID` | ID do plano mensal de R$149,99, dia 05, sem cobrança proporcional. |
| `MERCADO_PAGO_SUBSCRIPTION_ID` | ID da assinatura do cliente, após a adesão e conferência pelo proprietário. |
| `BILLING_PAYER_EMAIL` | E-mail exato do pagador dessa assinatura. |

O link informado, `https://mpago.la/1kodio9`, ainda precisa ser associado ao plano correto e validado. Apenas o link não fornece as credenciais nem vincula uma assinatura ao cliente. A assinatura deve iniciar no primeiro vencimento acordado: não ativar um plano que debite setembro. Não misturar assinatura ativa com cobrança avulsa, para evitar cobrança duplicada. [Assinaturas do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview).

## E-mail de pagamento recebido

O código envia pelo **Resend** e entrega no seu Gmail. Não precisa de API/senha do Gmail.

| Variável | Valor/origem |
|---|---|
| `RESEND_API_KEY` | Resend → API Keys → Create API Key, permissão Sending access. |
| `BILLING_EMAIL_FROM` | Remetente em domínio verificado no Resend, por exemplo `Central Frete <financeiro@seu-dominio.com.br>`. |
| `BILLING_NOTIFY_EMAIL` | Seu endereço Gmail que receberá o aviso. |
| `BILLING_CRON_SECRET` | Segredo aleatório exclusivo, pelo menos 32 caracteres; não é fornecido por uma API. |
| `BILLING_SCHEDULER_ENABLED` | `true` após configurar e testar. Executa reconciliação e envio da fila a cada cinco minutos enquanto o servidor estiver ativo. |

O Resend exige verificação do domínio remetente para o envio normal em produção. [Criar API Key](https://resend.com/docs/create-an-api-key), [verificar domínio](https://resend.com/docs/add-a-domain).

Para gerar o segredo, execute localmente `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` e copie o resultado diretamente para o Render. Não envie segredos ao GitHub ou ao chat.

O Render deste serviço está no plano gratuito. Suspensão por inatividade pode atrasar tarefas internas; o bloqueio e a ativação por data são conferidos pelo servidor a cada requisição. Para execução pontual independente de visitas, usar agendador externo chamando `POST /api/billing/maintenance` com `Authorization: Bearer <BILLING_CRON_SECRET>`, ou servidor sempre ativo.

## CEP e distância

| Serviço | Variável/configuração |
|---|---|
| ViaCEP | A busca de CEP implementada não usa chave. |
| Google Routes API | `GOOGLE_MAPS_API_KEY`, criada no Google Cloud com Routes API e faturamento habilitados. Restringir a chave à Routes API e definir cotas. |

A consulta de CEP continua disponível sem a chave do Google. O cálculo automático da distância depende dessa chave; a distância manual permanece editável. Google Routes pode gerar cobrança por uso. [Configuração oficial](https://developers.google.com/maps/documentation/routes/get-api-key), [uso e faturamento](https://developers.google.com/maps/documentation/routes/usage-and-billing).

## Variáveis existentes

Preservar `DATABASE_URL`, `CENTRAL_FRETE_SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_STORAGE_BUCKET`. A conexão com PostgreSQL e o Storage privado seguem usando Supabase. Se anexos falharem após a publicação, conferir a chave de servidor e o bucket privado.

## Ativação

Após publicar a branch aprovada, validar pagamento aprovado/pendente, webhook, e-mail e certificado em ambiente isolado. Só então configurar credenciais de produção, `MERCADO_PAGO_MODE=production`, `BILLING_SCHEDULER_ENABLED=true` e `BILLING_ENABLED=true`, mantendo `BILLING_FIRST_COMPETENCY=2026-10`. Essa ativação é necessária para começar a cobrar/bloquear; manter `false` continua liberando o sistema também em outubro.
