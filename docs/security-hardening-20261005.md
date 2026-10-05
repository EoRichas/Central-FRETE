# Segurança do Central-FRETE: atualização de 05/10/2026

## Escopo e decisão do usuário

Revisão e correção da aplicação, com reprodução controlada em laboratório local. O usuário pediu manter as senhas sob controle dos administradores e não implementar MFA. Não foram executados ataques, varreduras, tentativas de senha ou testes de carga no Vercel, Hostinger ou Supabase. O laboratório usou usuários fictícios, PGlite e HTTP local, sem credenciais de produção.

Base: main 90beb2f5047236087975ae78667b2bd7ee95517b (PR74). O trabalho não altera comissões, cálculos, cadastros comerciais, layout das vendas ou permissões por perfil.

## Resultado da reprodução

Antes da correção, um token de sessão emitido localmente continuou aceito por `verifyLocalSession` depois de executar o logout. Essa prova não dependeu de invadir uma conta nem de obter cookies reais: foi usada uma conta fictícia criada pelo próprio teste.

Depois da correção, o cookie copiado foi recusado após logout. Troca de senha, mudança de perfil/status/usuário e encerramento de todas as sessões também invalidam sessões anteriores. Nenhum achado desta revisão demonstra comprometimento anterior da produção.

## Alterações implementadas

- Sessões opacas aleatórias de 256 bits; somente o hash do token é persistido. Validade absoluta de 12 horas preservada. Cookies assinados antigos deixam de ser aceitos, exigindo um novo login após o deploy.
- Revogação individual no logout. `POST /api/auth/logout?all=true` encerra todas as sessões do usuário autenticado. A funcionalidade fica disponível na API, sem adicionar botões ao layout nesta atualização.
- Versão de segurança por usuário, alterada atomicamente pelo banco quando mudam senha, nome de usuário, perfil ou situação. Evita também emitir uma sessão a partir de credenciais verificadas antes de uma alteração concorrente.
- Limitação de login persistida no banco: até 10 tentativas por nome de usuário e 120 no total em uma janela de 15 minutos. Inclui tentativas bem-sucedidas. A resposta 429 informa `Retry-After`. Não há dependência de memória de uma instância ou de IP declarado pelo cliente.
- Orçamento global limita a criação de chaves por nomes inventados. Esse controle favorece proteção dos recursos; um ataque pode esgotá-lo e suspender novos logins por até 15 minutos. Sessões já abertas continuam funcionando. A camada de borda futura deve bloquear o tráfego abusivo antes da aplicação.
- Registros de login válido/inválido, limitação e logout. Sem senhas, tokens, IPs ou nomes de usuário em claro nos novos eventos de autenticação.
- Escritas exigem `Origin` exato. `Sec-Fetch-Site` incompatível é recusado. Outro subdomínio do mesmo domínio não recebe autorização automática. `X-Forwarded-Host` não é confiado para decidir a origem permitida.
- Corpos de autenticação limitados a 16 KiB, incluindo recebimento em chunks. JSON inválido retorna 400.
- Cadastro inicial fechado sem token administrativo de configuração. Uma trava transacional e um insert condicional impedem dois administradores iniciais concorrentes.
- `noindex`, `nofollow`, `noarchive`, proteção de tipo MIME, política de referenciador, HSTS sem estender a outros subdomínios e proteção contra enquadramento externo. Respostas de API recebem `private, no-store`.
- CSP de compatibilidade mantém scripts e estilos inline exigidos pelo aplicativo atual. Restringe fontes externas, formulários, base URL, objetos e frames. Não equivale a uma CSP estrita contra XSS; nonce/hash pode ser uma etapa futura com avaliação do custo de renderização. O iframe da OS permanece permitido na própria origem.
- Correção do destino de retorno do login: barras invertidas, caracteres de controle e origens externas são recusados.
- Verificação do bucket privado antes de acessar anexos, com cache de 60 segundos por instância. Falha ou bucket público bloqueia a operação; o código não altera a visibilidade do bucket automaticamente. Essa verificação não fecha um bucket já público: a configuração da infraestrutura deve permanecer privada.
- Mensagens externas do Storage não são mais repassadas integralmente ao navegador.
- Preparação opcional para Cloudflare Access usando `jose` 6.2.12: valida assinatura RS256, emissor, audience, expiração e identidade. Não confia somente na presença do cabeçalho. Sem configuração, permanece desativado. Configuração parcial falha fechada.
- Opções para separar conexão de migração e execução e desativar migrações no startup. Compatibilidade mantida por padrão. Nenhuma credencial ou papel de produção é trocado automaticamente.
- Next.js e eslint-config-next atualizados de 16.3.4 para 16.3.8.

## Dependências

A auditoria inicial identificou GHSA-vcvr-r3jv-pc5j na versão do Next.js. O advisory afeta `next/og ImageResponse` quando recebe valores controlados externamente em SVG. A busca no código do Central não encontrou esse uso. Não foi demonstrada exploração no Central. A versão foi atualizada por prevenção; `npm audit --omit=dev` passou a indicar zero vulnerabilidades conhecidas no catálogo consultado. Isso não equivale a ausência de qualquer falha.

## Validação

- 50 testes unitários passaram; o teste antigo de token assinado foi substituído por cobertura de sessão persistida na integração.
- 75 testes de integração passaram, incluindo 11 novos cenários de segurança.
- Testes locais: cookie copiado após logout; logout global; troca de senha; corrida entre login e alteração de credenciais; token inventado; sessão expirada; cookie duplicado; CSRF por outro site e subdomínio; cadastro inicial sem segredo; concorrência no primeiro administrador; limite concorrente por conta; orçamento global com nomes/IPs inventados; JSON inválido; corpo excessivo; privacidade dos logs; RLS/grants; assinatura, audiência e expiração incorretas no Access.
- A suíte de regressão continua cobrindo acesso por vendedor/operacional, anexos, pagamentos, OS, comissões e fechamentos.
- Build de produção e TypeScript passaram com Next.js 16.3.8. Lint sem erros; seis avisos preexistentes de navegação/imagem.
- Servidor local de produção: cabeçalhos e bloqueio de origem verificados por HTTP real. Chromium confirmou hidratação do login, envio da senha atual e presença do iframe da OS sem erros de CSP/JavaScript. APIs comerciais foram simuladas. A renderização interna completa do visualizador de PDF não foi comprovada neste Chromium headless.
- Consultas administrativas de leitura ao Supabase confirmaram bucket `central-frete` privado, ausência de grants efetivos de tabela aos papéis anon/authenticated e ausência de funções SECURITY DEFINER executáveis por esses papéis no schema public. O advisor retornou somente informações de RLS sem políticas, coerentes com a arquitetura de acesso exclusivo pelo servidor. Não foram consultados dados comerciais para esta verificação.

## Implantação

1. Migração `supabase/migrations/20261005122915_security_sessions_and_login_limits.sql` já aplicada ao Supabase em 05/10/2026 e registrada no ledger `central_schema_migrations`, conforme autorização anterior para migrações necessárias antes do merge. Verificação posterior confirmou coluna, trigger, RLS e ausência de grants públicos nas duas tabelas novas; os 10 usuários permaneceram cadastrados. A migração adiciona estruturas de autenticação e uma coluna técnica; não renumera vendas nem altera senhas.
2. Fazer merge/deploy somente após revisão do PR. Todos precisarão entrar novamente uma vez. As senhas continuam iguais.
3. Definir `CENTRAL_FRETE_PUBLIC_ORIGIN` com a origem HTTPS exata usada pelo Central, por exemplo `https://central.seudominio.com.br`, sem caminho. Enquanto não configurada, a aplicação usa a origem da URL recebida. Homologação e preview devem ter a própria origem; não reutilizar cookies de produção.
4. Deixar `CENTRAL_FRETE_SETUP_TOKEN` vazia na instalação existente. Para um banco novo: gerar segredo aleatório de 32 a 256 caracteres, configurar temporariamente na hospedagem, informá-lo no cadastro inicial e removê-lo depois. Não enviar o segredo em URL, commit ou chat.
5. Manter `CENTRAL_ACCESS_ISSUER` e `CENTRAL_ACCESS_AUDIENCE` ambas vazias até configurar o Access. Preencher apenas uma bloqueia o acesso por segurança.
6. Validar login, logout, anexos, geração/visualização de OS e perfis. Não executar testes de carga em produção.

A migração é aditiva e compatível com o código anterior. Em rollback, conservar as tabelas/coluna; não apagar sessões nem histórico automaticamente. Voltar ao código anterior também restaura as limitações de segurança anteriores e pode voltar a aceitar tokens antigos ainda dentro da validade.

## Proteção do subdomínio: depende da infraestrutura

Ainda faltam o domínio e o nome exato do plano Hostinger para ativar esta parte.

- Cadastrar a aplicação no Access e autorizar somente as pessoas previstas. MFA permanece fora desta atualização por decisão do usuário.
- Configurar issuer como `https://NOME-DA-EQUIPE.cloudflareaccess.com` e audience como o identificador da aplicação. Não usar o endereço público do Central como issuer.
- O proxy da aplicação verifica o Access em todos os caminhos, inclusive documentos, arquivos estáticos e health check. Endereços temporários não têm uma exceção. Planejar a monitoração autenticada antes de habilitar.
- Testar o endereço normal e o endereço direto da hospedagem. Sem token válido, ambos devem recusar a aplicação. O teste local de assinatura não comprova configuração correta do Cloudflare/Hostinger real.
- Preservar os registros do site institucional e e-mail ao mudar DNS. Não configurar cache compartilhado para APIs, relatórios ou comprovantes. Não ativar duas CDNs sobrepostas sem avaliação.
- Remover/proteger implantações antigas: o código novo não fecha uma aplicação antiga ainda publicada.
- Confirmar compatibilidade do plano gerenciado; não presumir disponibilidade de firewall ou `cloudflared` como em uma VPS.
- `noindex` reduz indexação em mecanismos que respeitam a regra, mas não oculta o domínio de DNS, histórico ou registros de certificados. `robots.txt` não substitui autenticação.

## Separação de privilégios, backups e alertas

`DATABASE_MIGRATION_URL` permite a conexão privilegiada durante a etapa de migração. `CENTRAL_FRETE_MIGRATE_ON_START=false` permite executar o aplicativo com uma conexão sem DDL após migrar em etapa separada. Para a separação efetiva, não deixar a credencial de migração no ambiente do processo web; disponibilizá-la somente no job administrativo. Por padrão, o fluxo antigo de startup é preservado para evitar quebrar o deploy atual.

Ainda dependem de operação/configuração: criar e conceder o papel de execução apropriado, remover a credencial elevada do runtime, testar restauração de backup, retenção/exportação de logs e alertas. Não foram criados serviços pagos, tarefas agendadas ou novos provedores. Os eventos estão disponíveis no banco, mas não há promessa de notificações externas automáticas.

## Limites e custos

Os testes de ataque desta atualização foram locais e não consumiram requisições do Vercel. Abrir/publicar o PR pode acionar os pipelines e previews já configurados pelo proprietário; estes podem consumir cotas normais de build. Não foi alterada a automação de deploy.

Hobby tem limites de uso e pode suspender funcionalidades ao ultrapassá-los. Não tratar o plano como autorização para tráfego ilimitado nem como proteção automática contra abuso.

Uma próxima avaliação em produção exige URL exata, janela, contas fictícias e limite de requisições/concorrência combinado. Não inclui DoS, extração de dados reais ou exploração do provedor.

## Referências

- https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
- https://developers.google.com/search/docs/crawling-indexing/block-indexing
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://vercel.com/docs/plans/hobby
