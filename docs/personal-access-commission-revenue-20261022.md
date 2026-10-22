# Acesso pessoal, permissões e faturamento individual

## Comportamento

- Configurações permite a todos os perfis trocar a própria senha, informando a senha atual e confirmando a nova. A administração de usuários continua exclusiva do ADMIN.
- O endpoint de troca usa somente o ID da sessão, valida origem e tamanho do corpo, limita tentativas por conta e atualiza credenciais com comparação da versão anterior. O gatilho de segurança já existente invalida as sessões anteriores. Auditoria não recebe senhas, hashes ou cookies.
- OPERACIONAL pode editar vendas/fretes, consultar relatórios e emitir/visualizar OS. Edição preserva responsável e comissão histórica; comissão de outro usuário continua oculta e não pode ser alterada pelo operacional. Exclusão, administração de usuários e fechamento mensal mantêm seus acessos anteriores.
- Permissões do vendedor para editar e receber nas próprias vendas continuam sujeitas à propriedade por ID.
- Relação de vendas usa espaçamento compacto para comportar cinco serviços curtos e os totais em uma página. Textos extensos continuam integralmente nas páginas seguintes. A OS individual mantém o espaçamento anterior.

## Comissão zero e registros anteriores

Faturamento individual considera somente vendas com comissão efetiva maior que zero. O valor combinado prevalece sobre o percentual; um valor combinado zero exclui o crédito individual mesmo com percentual positivo. Valor combinado positivo conta mesmo com percentual zero.

A regra é calculada ao consultar qualquer competência, inclusive antiga. Não depende de editar novamente as vendas nem executa atualização destrutiva no banco. A listagem mantém vendas com comissão zero e os valores originais. Receita, recebimentos, saldo, relação do cliente e fechamentos históricos da empresa continuam preservados.

Vendas comerciais vinculadas a fretes usam a comissão do frete de origem para atribuição individual. Relatórios consolidados e controle de comissões mantêm uma única linha por serviço vinculado. O painel financeiro mantém a composição anterior dos totais da empresa.

## Validação

Testes locais com PostgreSQL em memória cobrem perfis, isolamento por usuário, senha atual/confirmada, CSRF, limite de tentativas, troca concorrente e revogação de sessões. Casos históricos cobrem percentual zero, valor combinado zero, valor combinado positivo, vínculos da Frota e preservação das vendas e recebimentos. PDF verificado em cinco e dez serviços, observação extensa e OS individual.

Não requer nova migração de esquema ou troca de credenciais de usuários existentes.
