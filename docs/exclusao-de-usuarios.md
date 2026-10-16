# Exclusão de acesso com histórico preservado

O administrador pode excluir outro usuário mesmo que existam vendas, fretes,
comprovantes, OS, comissões ou outros registros vinculados. A exclusão encerra
as sessões, remove as credenciais e retira a conta da gestão de usuários e das
opções de responsáveis por novas vendas. Não permite excluir a própria conta
administrativa durante a sessão.

A identidade original permanece em `users`, marcada por `deleted_at`, com o
mesmo ID, nome, telefone e perfil de comissão. Os documentos, valores e chaves
estrangeiras não são alterados. Relatórios e consultas históricas continuam
atribuindo as operações ao responsável original. Isso é exclusão do acesso,
não eliminação dos dados necessários ao histórico comercial.

O login pode ser cadastrado novamente, mas a nova conta recebe outro ID e não
herda as vendas ou permissões da conta excluída. A API de edição não reativa
identidades excluídas. Uma restrição no banco impede que uma identidade marcada
como excluída mantenha credenciais ou fique ativa.

Aplicar `20261016133115_preserve_deleted_user_history.sql` antes de publicar as
rotas atualizadas. A migração é aditiva e não exclui nem desativa contas. A
exclusão futura grava a auditoria e revoga as sessões na mesma transação.

O teste de integração usa apenas dados fictícios e verifica os vínculos,
comprovante, snapshot da OS, relatório, sessão anterior, autorização, tentativa
de reativação e recriação do login sem herança do histórico.
