# Frota: navegação, vendas e histórico mensal

Complemento sobre a main após o merge do PR #58.

## Problemas e alterações

- A seta nas tabelas abria diretamente a edição, enquanto a rota abria os detalhes. Os dois acessos agora abrem os detalhes; a edição permanece no botão dessa tela e respeita as permissões existentes. Faturamento também abre detalhes de fretes coletados em outro mês.
- Visão geral passa a ser a primeira aba e continua sendo a tela inicial dos perfis com acesso à operação completa.
- A largura mínima de 1420px da tabela causava rolagem horizontal. As tabelas da Frota passam a respeitar a largura disponível e mostram cartões em espaços menores, sem cortar colunas. Modais ficam fora do contêiner responsivo.
- Vendas comerciais e fretes operacionais são cadastros distintos. A aba Vendas mostra também operações sem venda comercial Frota vinculada, em uma seção própria por mês da coleta. Não converte registros, não gera números de venda e não altera canais. Vendedores continuam sem acesso ao cadastro operacional.
- O filtro de mês da Frota controla também a lista comercial. Vendas ganha consulta explícita de todos os meses e paginação de 200 registros; a exportação acompanha o período. Requisições sem filtro explícito continuam abrindo o mês atual.
- Fechamento mensal oferece meses registrados, consulta das versões salvas e histórico mensal dos veículos. O fechamento vigente usa seu snapshot preservado; custos históricos dos veículos são referência e não são descontados novamente.
- A apuração mensal atual inclui seguro, nota fiscal, ICMS e CTe/MDFe, que faltavam nessa consulta após o PR #58. Snapshots antigos não são reescritos.
- Faturamento de todos os meses continua excluindo fretes sem data de faturamento.

## Validação

- TypeScript e build Next.js concluídos.
- 47 testes gerais e 35 testes de integração aprovados.
- Regressões cobrem consulta histórica, vínculo comercial, separação de canais e permissões, custos fiscais e preservação de snapshots.
- Lint sem erros; seis avisos preexistentes em outros componentes.
- Sem nova migração e sem escrita no banco de produção.
- A interface precisa de conferência no ambiente publicado: navegador local indisponível nesta execução. Não foram inspecionados registros reais de produção; as correções de consulta foram verificadas com PostgreSQL local de testes.
