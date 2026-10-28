# Correções após o PR 110

- Relatório motorista consulta e exporta somente a dimensão motorista; não possui filtro nem coluna de veículo. Relatório veículo consulta sua própria dimensão. A consulta interna de Comissões mantém a combinação motorista/veículo.
- PDFs de motorista e veículo exibem o cabeçalho institucional e os filtros somente na primeira página. Cabeçalhos das colunas e rodapé/paginação permanecem nas continuações para identificar os dados.
- Buscas dos relatórios usam o layout do relatório de vendas, com controles alinhados e botão Consultar sem quebra de linha. O painel de prestadores deixa de acrescentar uma caixa externa diferente das demais buscas. Exportação e prévia usam os filtros efetivamente aplicados.
- Cadastros de veículos e motoristas continuam empilhados, com busca independente em cada lista. As buscas ignoram acentuação. Barras de rolagem ficam invisíveis, preservando rolagem por mouse, touchpad e teclado.
- A tabela Frota usa espaçamento menor e reserva a coluna da seta. Textos longos não deslocam as ações; nome/rota completos permanecem disponíveis no tooltip e no detalhe.
- Duplo clique na linha ou no número da venda abre a edição autorizada, inclusive no perfil vendedor. A seta mantém a abertura de detalhes; o número continua acessível por teclado. O carregamento do vendedor verifica o ID antes de apresentar um formulário de edição.
- Excluir frete fica visível no cabeçalho e no rodapé do editor para perfis com permissão (ADMIN/FINANCEIRO/VENDEDOR/OPERACIONAL), mantendo o fluxo existente de confirmação e autorização.
- Exclusão liberada também para vendedor (somente seus próprios fretes) e operacional (escopo já acessível da Frota). A API valida a autorização e revalida vendedor/propriedade dentro da transação antes de excluir. A confirmação e a preservação de venda/OS vinculadas continuam iguais.
- Conforme confirmação do usuário, Novo/Editar frete deixa de mostrar Prioridade e Status operacional. Situação do serviço (Retira/Entrega/Embarque) e pagamento permanecem. Edição preserva os valores históricos dos campos retirados; criação mantém os padrões existentes NORMAL/SEM_PREVISAO. Os filtros da consulta e os registros anteriores não são apagados.

Validação: 129 testes de componentes/regras e 111 testes de integração passaram, incluindo filtros por dimensão, cabeçalho somente na primeira página, pesquisas independentes, duplo clique e preservação dos campos históricos. TypeScript, build e lint dos arquivos alterados passaram. Revisão visual com componentes reais e dados fictícios, sem acesso a dados de produção.

Sem migração de schema ou alteração em dados de produção. Este PR não contém credenciais ou capturas de produção.
