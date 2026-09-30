# Ajustes da Frota, Financeiro e Comissões

## Comportamento

- Cada aba da Frota mantém sua competência durante a navegação. Ao recarregar a página, os filtros começam no mês atual.
- Salvar/Cancelar/Excluir da venda ficam no fluxo normal, depois do formulário.
- Novo frete e Nova venda usam fundo branco. O botão Novo frete alinha com o campo de competência.
- A comissão prevista usa o percentual do vendedor, recalcula ao digitar o valor do frete e não depende de distância/despesas preenchidas. Administradores selecionam o vendedor; vendedores usam o próprio cadastro. Taxas históricas e validação no servidor são preservadas.
- Fretes da Frota possuem tipo de local de origem e destino: Pátio, Porta ou Ponto de encontro, com persistência, detalhes e novas versões da OS. Campos legados ficam não informados. Financeiro não altera esses campos operacionais.
- Veículos da Frota possuem modelo opcional (até 120 caracteres), no cadastro, edição, listagem e seleção do frete. Cadastros antigos continuam válidos.
- Comissões dos motoristas usam o mês da coleta, independentemente de faturamento. Isso vale para visão geral, detalhamento, apuração mensal e PDF. Um frete faturado em outro mês gera somente a comissão no mês de coleta; a receita e os demais custos mantêm a regra de faturamento. Fechamentos salvos continuam com seus snapshots originais.
- Financeiro usa a consolidação autorizada de Vendas Geral, sem limite de 500 vendas e sem duplicar vendas vinculadas à operação. Filtro Frota/Cegonha/Ambos; detalhes dos fretes em modal; custos estimados/pendentes sinalizados. Data da venda para Cegonha e data da coleta para Frota.
- Comissões agrupadas por ID do vendedor, recolhidas inicialmente, com nome, total e número de vendas. A expansão mantém os detalhes, pagamentos e permissões existentes. Registros históricos sem ID têm agrupamento separado.

## Banco e implantação

Aplicar `supabase/migrations/20260930183118_fleet_vehicle_model.sql` e `supabase/migrations/20260930184218_fleet_location_types.sql` antes de publicar o código. Os arquivos estão registrados no runner `npm run migrate`. Acrescentam `fleet_vehicles.model`, `fleet_freights.origin_location_type` e `fleet_freights.destination_location_type`, sem alterar dados anteriores, políticas ou concessões. As migrações foram testadas duas vezes em PostgreSQL local (PGlite); não foram aplicadas em produção nesta entrega.

Rollback: retornar ao código anterior e manter a coluna adicional. Não remover a coluna depois de iniciar o cadastro de modelos.

## Verificações

61 testes de integração e 49 testes unitários passaram. Build de produção com TypeScript passou. A conferência de navegador cobre filtros independentes, modelo, comissões automáticas, agrupamento, detalhes do Financeiro, botões e formulário em desktop/celular. Lint mantém apenas os avisos preexistentes.
