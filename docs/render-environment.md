# Ambiente da Central Frete no Render

O serviço utiliza as variáveis de banco, sessão e armazenamento documentadas no `README.md` e em `.env.example`. `GOOGLE_MAPS_API_KEY` continua opcional para a integração existente de distâncias.

O aplicativo não possui mais certificado digital, cobrança de licença nem bloqueio por mensalidade. As variáveis `BILLING_*`, `MERCADO_PAGO_*`, `RESEND_API_KEY` e `APP_URL` não são usadas pelo código após esta remoção.

Antes da implantação, desative `BILLING_ENABLED` e `BILLING_SCHEDULER_ENABLED` no ambiente antigo, se estiverem presentes. Depois de confirmar o deploy da versão sem licenciamento, remova as variáveis obsoletas exclusivas deste serviço. Preserve as variáveis de sessão, banco, armazenamento e mapas.

A alteração de código deve ser integrada à branch acompanhada pelo Render e publicada. A versão anterior ainda pode exibir o certificado até a conclusão do deploy. Verifique `/api/health`, o login e a navegação após a publicação.

Notificações e assinaturas no Mercado Pago, bem como agendamentos externos, exigem encerramento no serviço de origem. Veja [Retirada do certificado digital](retirada-certificado-digital.md).
