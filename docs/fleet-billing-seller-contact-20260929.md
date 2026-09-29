# Faturamento, fechamento mensal e contato da OS

Correção baseada no main após o PR #62. Nenhuma migração nova.

## Dados da Frota

- Faturamento e seu indicador na visão geral incluem fretes operacionais e vendas comerciais do canal Frota sem vínculo operacional, sem limite de 500 registros. Venda vinculada entra uma vez pelo frete.
- Fretes usam faturamento ou, provisoriamente, coleta; vendas comerciais usam sua competência. Cegonha permanece no consolidado mensal, separada das vendas Frota.
- Comissões são somadas nos próprios fretes, sem depender de cadastro ativo/existente do motorista. Histórico sem ID fica agrupado pelo nome registrado, sem atribuí-lo automaticamente a um cadastro homônimo. Não é inferida comissão de motorista a partir da comissão do vendedor.
- Fechamento mensal abre na apuração atual. Fechamentos salvos permanecem disponíveis no seletor e não são recalculados. A tela informa quando a consulta atual difere do conceito de fechamento salvo.
- Receitas de vendas Frota e comissões dos motoristas têm linhas próprias, além da relação dos registros incluídos, com número, cliente, data e receita. Dados não existentes nos snapshots antigos são identificados como não disponíveis. Comissões antigas agregadas continuam dentro das despesas diretas, sem inventar sua divisão.
- Pendências de data de faturamento, combustível realizado e custos continuam bloqueando o fechamento definitivo conforme o fluxo existente.

## Interface

- Notificações de sucesso em Frota e Configurações desaparecem após 3 segundos. Repetir a mesma ação reinicia o prazo; desmontar a tela cancela o timer. Avisos de erro e pendências com ação continuam visíveis.
- Campo Operação da Frota removido do cadastro/edição de Cegonha. Vínculos históricos são preservados ao editar. O controle continua disponível no canal Frota para o administrador.
- Tabelas largas e sua rolagem interna são preservadas.

## OS

- Contato comercial vem de seller_id; em registros antigos sem ID, usa nome exato normalizado somente quando houver um único cadastro correspondente. Telefone ausente ou nome ambíguo fica não informado.
- OS de frete direto usa created_by. Se houver venda vinculada, prevalece a vendedora da venda. Visualizador/emissor serve para autorização e auditoria, sem determinar o telefone.
- Fonte do telefone é consultada na mesma instrução SQL que gera o snapshot. Alternar emissores não cria versões novas; alterar o telefone responsável torna a OS desatualizada.
- Documentos antigos com telefone do emissor ficam sinalizados para Atualizar OS; o histórico permanece intacto. Não há atualização silenciosa ao abrir um PDF antigo.
- Na nova emissão, telefone usa Helvetica regular, azul discreto e fundo off-white correspondente ao timbrado, com alinhamento ao contato existente. Layout e conteúdo do modelo do cliente são preservados, sem custo operacional.

Referência visual: timbrado existente e imagens enviadas em 29/09. A intervenção é localizada no contato, sem redesenho da identidade.

## Verificação

48 testes gerais/PDF e 44 testes de integração PostgreSQL local via PGlite. Cobertura nova: mais de 500 vendas Frota; vínculo em competência diferente sem duplicação; soma das comissões históricas; reconciliação faturamento/fechamento; vendedor, administrador e financeiro emitindo a mesma OS; telefone ausente/homônimos; histórico imutável. TypeScript, lint e build verificados na entrega. Lint tem seis avisos preexistentes, sem erros.

PDF de teste fictício renderizado e inspecionado. Interação das telas no navegador não validada neste ambiente. Não houve merge, deploy nem alteração de dados reais. As migrações dos PRs anteriores continuam sendo pré-requisito da aplicação.
