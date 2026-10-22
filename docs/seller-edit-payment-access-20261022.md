# Vendedores: edição e baixa das próprias vendas

Na Central, VENDEDOR pode editar suas vendas Cegonha e Frota comercial, registrar recebimentos/adiantamentos e confirmar recebimentos. A lista operacional da Frota oferece **Ver detalhes → Editar / dar baixa**, reutilizando o formulário existente com comprovante e situação do pagamento. Lista, detalhes e saldo são atualizados depois de salvar.

A autorização usa `seller_id` do registro e o ID da sessão no servidor. As rotas de comprovantes e de baixa operacional aplicam a mesma regra. Uma chave de idempotência já usada em outra venda não revela o recebimento nem cria um novo lançamento.

A edição mantém o responsável e a taxa histórica de comissão, mesmo se o cadastro tiver sido alterado; a comissão combinada continua editável conforme as regras existentes. O status operacional passa a ser editável e deixa de retornar implicitamente a CONFIRMAR. Pagamentos já registrados não são apagados ao editar a venda.

Vendedores continuam sem exclusão de vendas/recebimentos, troca de responsável, vínculo administrativo com operação/viagem e acesso administrativo/financeiro global. Custos enviados como confirmados não concedem autorização de pagamento a prestadores. Cadastros inativos já vinculados permanecem disponíveis na edição sem expor dados pessoais adicionais.

Sem alteração de schema ou migração: a liberação é aplicada ao perfil existente pelo código. Validação inclui testes de interface, API/PostgreSQL, propriedade por ID, comprovantes, isolamento de terceiros, idempotência, preservação de comissão/status e regressões dos demais perfis.
