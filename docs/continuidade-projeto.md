# Continuidade da Central Frete

Análise do histórico compartilhado em https://chatgpt.com/share/6aa0784c-453c-83e9-a3ae-f05a9b7a5a23 e conferência de GitHub, código e deploys do Render. A conversa contém decisões antigas posteriormente corrigidas; prevalecem as regras finais abaixo.

## Estado verificado

- Repositório: EoRichas/Central-FRETE. O PR #13 foi integrado à main no commit `8577f526a49e1fdeeab7b1577bdb84422ac87c21`.
- O deploy desse commit falhou na verificação TypeScript. O Render continua com o commit anterior `df6c704d2d036406e3d04a13e6e3fd43bb048eea` em estado live.
- Causa registrada nos logs: `lib/server/billing.ts`, acesso a `state.nextUnpaid` sem considerar o retorno usado quando o licenciamento está desativado.
- Correção local: verificar a existência de `nextUnpaid` e manter a disponibilidade de pagamento falsa quando não houver competência. Sem mudar valor, credenciais ou datas.
- Verificação local após a correção: `npm run build` passou; os 13 testes de `node --import tsx --test tests/billing.test.ts` passaram; ESLint do arquivo e `git diff --check` passaram.
- O comando antigo com apenas `--experimental-strip-types` falha ao resolver os imports `@/` introduzidos nos testes posteriores. Nesta análise foi utilizado o carregador tsx já instalado. A suíte completa de integração não foi reexecutada.
- A correção está na branch local `fix/billing-overview-build`; não foi enviada ao GitHub ou publicada nesta análise.

## Decisões preservadas

- Uma única empresa. Permanecer no Render, preparando futura migração para Hostinger.
- Mensalidade real de R$149,99, todo dia 05, primeira competência outubro/2026. Setembro é gratuito e não equivale a pagamento fictício.
- Pagamento na Central disponível de 30/09/2026 em diante para outubro. Dia 05 inteiro permitido; bloqueio operacional a partir de 06/10, em Brasília, se houver pendência. Administrador e Financeiro mantêm acesso à regularização.
- Pix mensal e assinatura automática são opções diferentes. Depois de quitar a competência, não oferecer pagamento repetido. Com assinatura vinculada, Pix fica indisponível para evitar débito duplicado.
- A licença antecipada inicia sua validade no dia 05. O aviso dos cinco dias não substitui a restrição de checkout do PR #13.
- O histórico corrigiu a orientação dos 27 dias grátis: não tratar esse período por adesão como gratuidade global de setembro. A configuração final solicitada foi plano sem teste grátis, dia 05, sem proporcional. A primeira cobrança efetiva ainda exige conferência no Mercado Pago; esta análise não acessou a conta do provedor.
- Resend e Google Routes pago deixam de ser a solução pretendida. Google Apps Script para Gmail e distância permanece pendente de implementação. O código atual ainda chama os provedores antigos.

## Funcionalidades e pendências verificadas no código

- O painel da Frota contém rateio do escritório por mês, proporcional aos quilômetros, e perfil OPERACIONAL com permissão para editar fretes.
- Motoristas são devolvidos pelo servidor sem veículo vinculado; a migração remove vínculos anteriores. Ainda há campo de vínculo e lógica antiga na interface que merecem limpeza posterior; não foram alterados nesta correção.
- O botão global de nova venda foi removido do AppShell.
- Em produção, a reconciliação de assinatura ainda exige `MERCADO_PAGO_SUBSCRIPTION_ID` e `BILLING_PAYER_EMAIL` corretos. Apenas possuir um plano não ativa automaticamente esse vínculo.
- Não há endpoint próprio de cancelamento de assinatura no módulo atual. A discussão sobre cartão não comprova implementação de cancelamento/desvinculação pela Central.
- O histórico registra pagamento de teste de R$1 aprovado no Mercado Pago, mas sem baixa no banco da Central. O código ainda compara `live_mode` estritamente. Não considerar o fluxo completo de confirmação, licença e certificado homologado.
- Os valores atuais das variáveis do Render não foram lidos: o plugin disponível não oferece essa consulta. O retorno a produção e a resolução do HTTP401 foram informados no histórico pelo usuário, sem nova verificação de credenciais nesta análise.

## Próximo passo imediato

Enviar a correção de compilação para revisão e publicar somente após a autorização aplicável. Confirmar que o Render coloca o novo commit em estado live; só então verificar a janela de pagamento no site. Depois tratar a confirmação automática real e, em seguida, a adaptação para Apps Script, uma etapa por vez.
