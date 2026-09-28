# Número e OS nos fretes da Frota

Complemento após o merge do PR #60, solicitado em 28/09/2026.

## Interface

- A tabela de fretes, inclusive Últimos fretes, mostra Venda como primeira coluna. O número também aparece no cabeçalho dos detalhes e pode ser pesquisado.
- Os detalhes da Frota oferecem Visualizar OS. A tela permite gerar, atualizar, imprimir e baixar o documento mais recente, sem seletor nem indicação de versão.
- Remove Todos os meses e alinha Competência com os demais filtros, reservando largura para a data completa e o calendário. Ao limpar o campo, retorna ao mês atual.
- Mantém as tabelas largas e sua rolagem interna.

## Numeração e documentos

A migração 015_fleet_numbers_and_orders.sql inclui os fretes operacionais no contador global já usado pelas vendas comerciais. Fretes antigos sem venda vinculada recebem os próximos números disponíveis; fretes vinculados usam o número comercial existente. A conversão registra auditoria e é repetível.

Novos fretes recebem número automaticamente. Uma nova venda comercial vinculada ao frete reutiliza seu número e adota sua OS e histórico existentes. O banco e a API impedem edição manual de números. Não é possível ligar dois registros já numerados com números diferentes, pois isso alteraria a identificação de um deles.

Uma OS pode pertencer a uma venda comercial ou a um frete direto, nunca a ambos. O mesmo serviço de emissão mantém snapshots imutáveis e serializa emissões repetidas. O acesso pela Frota resolve a OS comercial quando já houver vínculo, evitando documentos paralelos.

A OS direta usa cliente, rota, veículos transportados e valor do frete. Não inventa CPF/CNPJ, endereço do cliente, prazo, forma de pagamento ou vencimento ausentes do cadastro operacional. Custos internos, datas de entrega e versões não são impressos. O modelo é o mesmo das vendas comerciais.

## Permissões e exclusão

OS operacional acessível a ADMIN, GERENCIA e FINANCEIRO, que já têm acesso à Frota e aos documentos. Vendedores continuam usando suas vendas comerciais; OPERACIONAL permanece sem acesso às OS. Nenhuma permissão global foi ampliada.

A exclusão administrativa de um frete remove sua OS própria e snapshots, com aviso no diálogo. Uma venda vinculada e sua OS são preservadas, conforme o comportamento existente. O número de outro cadastro nunca é reaproveitado.

## Implantação e validação

Migração integrada ao runner, aplicada uma vez na inicialização da próxima implantação. Não executada em produção nesta entrega. Guardar backup antes de implantar. A migração usa transação, bloqueio das tabelas durante a atribuição e timeout de 10 segundos para aquisição do bloqueio; falha reverte schema, números e auditoria juntos. Reverter apenas o código após o COMMIT não desfaz os números atribuídos nem os documentos novos; não executar migrations antigas para tentar desfazer a alteração.

Validado com 47 testes gerais e 39 de integração, TypeScript e build. Lint sem erros, seis avisos preexistentes. Regressões cobrem migração de base anterior, sequência compartilhada, idempotência, rollback de falha, OS direta, vínculo posterior com preservação do histórico, permissões, custos internos e exclusão. PDF de demonstração renderizado e conferido visualmente.

A interface ainda precisa de conferência no navegador do ambiente publicado; navegador local indisponível nesta execução. Nenhum registro real de produção foi consultado ou alterado.
