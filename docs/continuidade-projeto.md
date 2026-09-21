# Continuidade da Central Frete

## Estado do código

A base desta alteração é a `main` no commit `130454c`, que contém o PR #48 com a imagem limpa de login, margem por frete, resultado por viagem e fechamento mensal.

Em 21/09/2026 foi solicitada a retirada integral do certificado digital e da cobrança vinculada ao acesso. As regras anteriores de mensalidade, carência, validade e bloqueio deixam de fazer parte do aplicativo. A negociação comercial passa a ser conduzida fora do sistema.

O código remove a tela de certificado, as rotas de cobrança, a integração com Mercado Pago, a emissão do PDF e o agendador de reconciliação e e-mail. O login continua exigindo sessão válida, usuário ativo e perfil autorizado.

## Operação

As alterações de fretes, viagens, fechamento mensal, recebimentos e comprovantes continuam disponíveis. O faturamento dos fretes não é a cobrança da licença do aplicativo.

As tabelas antigas de licenciamento são preservadas como histórico privado e não são consultadas pelo aplicativo. A migração histórica `003_fleet_billing.sql` também cria estruturas da Frota, por isso permanece intacta.

## Conclusão externa

A remoção do código não cancela automaticamente inscrições, planos, preferências de checkout ou notificações configuradas no Mercado Pago. O encerramento externo deve ser conferido na conta responsável. Consulte [Retirada do certificado digital](retirada-certificado-digital.md).

O estado do deploy e das configurações externas precisa ser conferido na entrega; a existência deste documento não comprova publicação em produção.
