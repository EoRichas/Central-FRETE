# Operacional: acesso às vendas e conclusão do faturamento

Correção do escopo solicitado após o PR71: o Operacional acompanha todas as vendas e fretes, inclusive os cadastrados por vendedores e outros usuários, para concluir a operação, faturar e anexar comprovantes.

- Listas e detalhes de Cegonha, vendas comerciais Frota e fretes operacionais deixam de filtrar pelo criador quando o perfil é Operacional. Vendedores continuam restritos ao próprio seller_id.
- Nos detalhes da venda, Atualizar faturamento permite alterar o status operacional e a data de faturamento. Endpoint específico mantém vendedor, taxa de comissão, valor e demais dados intactos, com auditoria. Em vendas vinculadas, a data também é atualizada no frete que alimenta os relatórios.
- Operacional pode anexar comprovantes, registrar recebimentos, atualizar custos/prestadores da venda e confirmar pagamento do frete. Permanecem as validações de arquivo, valor e comprovante pertencente ao mesmo registro.
- A Frota mantém a edição operacional e passa a mostrar os controles de pagamento. O atalho Vendas Frota permite acessar também os registros comerciais desse canal.
- Operacional não recebe comissão nas próprias criações e não visualiza comissão do vendedor. Atualizar uma venda de terceiro preserva sua autoria e taxa original.
- Exclusão de vendas/fretes e exclusão/estorno de recebimentos mantêm as permissões anteriores. O fechamento mensal contábil mantém seu acesso anterior; este pedido se refere à conclusão e cobrança de cada venda.

Não exige migração nem alteração do banco em produção.

Validação: 63 testes de integração e 49 testes unitários; build e TypeScript; lint sem erros e com seis avisos preexistentes. Navegador com API simulada verifica ações de faturamento, recebimento e anexos nos dois canais; regras e persistência são verificadas pela integração PostgreSQL local.
