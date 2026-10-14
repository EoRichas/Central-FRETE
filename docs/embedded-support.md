# Suporte dentro dos sistemas

O menu Suporte abre o formulário, a lista de chamados, a conversa e os anexos dentro do sistema de origem. Não há redirecionamento nem conta adicional para o solicitante. A sessão local e a empresa selecionada são verificadas em todas as requisições. O painel de atendimento permanece separado.

## Configuração protegida

No servidor de origem, configure `SUP_SUPPORT_ORIGIN` com a origem HTTPS do atendimento. Para cada empresa atendida pelo servidor, configure `SUP_<EMPRESA>_KEY` e `SUP_<EMPRESA>_IDENTITY_KEY`, usando CENTRAL, CZAR ou EKON. Ambas são chaves aleatórias com pelo menos 48 caracteres. Não use variáveis NEXT_PUBLIC, não inclua valores reais no Git e não reutilize senhas de usuários.

A primeira chave autentica a comunicação entre servidores. A segunda gera uma referência estável e opaca para o usuário. Preserve a chave de identidade ao rotacionar a chave de comunicação; sua substituição exige migração das referências dos chamados.

No atendimento, configurar as contas dedicadas e aplicar a migração de identidade de origem antes de ativar os servidores. Cada conta de integração pertence apenas à sua empresa, não é gerente e não integra a equipe de atendimento.

## Proteções e limites

As chamadas são assinadas com HMAC-SHA256, timestamp e nonce; nenhuma senha, cookie ou token da sessão da empresa é encaminhado. A identidade vem da sessão validada no servidor, com primeiro nome e referência opaca. O atendimento impõe empresa e proprietário em listagens, detalhes, mensagens e anexos; notas internas nunca são retornadas às empresas. Status, prioridade e responsável só podem ser alterados pela equipe.

Arquivos PNG/JPEG/WebP/PDF até 5 MB são enviados pelo servidor e mantidos privados. O formulário orienta a ocultar dados sensíveis: imagens não recebem anonimização automática. Texto livre e anexos não são enviados à IA.

O atendimento limita a repetição de requisições em memória e deve permanecer em uma instância até adotar armazenamento compartilhado para nonces e limites. A consulta automática de respostas ocorre a cada 5 segundos com a página visível. O ciclo automático aguarda uma atualização em andamento terminar antes de iniciar outra. Hospedagens que suspendem por inatividade podem exigir nova tentativa na primeira chamada.

## Validação e operação

Validar sessão ausente/expirada, CSRF, assinatura inválida, empresa incorreta, usuário diferente, repetição, abertura, resposta pública, nota interna, envio/download de evidências e falhas temporárias. As migrações dos sistemas de origem não são alteradas. Em rollback, retirar o menu/rotas de suporte e preservar os chamados no atendimento.

## Chats iniciados pelo Sup

O suporte pode escolher uma pessoa ativa da empresa e iniciar uma conversa direta. Ela aparece na seção Suporte sem número, prioridade ou formulário de chamado, com atualização a cada cinco segundos enquanto a aba está visível. Somente a equipe encerra: o Sup exclui a conversa e suas mensagens; a tela limpa o chat e seu rascunho na próxima atualização. Chamados existentes e novas solicitações dos usuários mantêm o fluxo anterior.

O endpoint `support-directory` consulta apenas usuários ativos e exige HMAC de servidor, prazo e nonce. Retorna nome de exibição e referência opaca HMAC, sem e-mail, senha, token ou ID interno. Usa as mesmas variáveis `SUP_*_KEY` e `SUP_*_IDENTITY_KEY` da integração. O Sup precisa da origem HTTPS deste sistema em `SUP_SOURCE_ORIGINS_JSON`. Proteções de acesso do proxy permanecem aplicáveis.
