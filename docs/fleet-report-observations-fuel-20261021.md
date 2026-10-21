# Relatório de vendas, observações da OS e custos Frota

O botão **Gerar relatório de vendas**, no cabeçalho da consulta por cliente, gera uma prévia com todos os serviços do cliente e período de criação já consultados. Inclui apenas observações habilitadas e salvas nas OS individuais; mantém as regras de acesso do vendedor e a deduplicação de vendas comerciais vinculadas a operações. Totais são recalculados no servidor. O PDF oferece impressão e download.

**Adicionar Observação** continua restrito à venda aberta. Ao confirmar em **Visualizar PDF**, a escolha Sim/Não e o texto são gravados em campos próprios da venda/operação, com auditoria. A OS reaberta e o relatório usam esse texto. Escolher Não remove a observação dos documentos, preservando o texto para edição futura. As anotações originais da venda e as versões já emitidas da OS não são reescritas. Exportar uma versão histórica explícita mantém seu snapshot.

Antes desta alteração, os textos personalizados existiam apenas no PDF temporário do navegador. Eles não podem ser recuperados do banco; devem ser informados novamente na OS para entrar nos próximos relatórios.

O formulário Frota passa a exibir Seguro, Nota Fiscal, CTE/MDF e Avarias nessa ordem. Avarias tem coluna própria e participa dos custos, resultado e fechamento mensal. ICMS histórico não é convertido em avarias. KM inicial/final, litros, valor de bomba e combustível pago saem do formulário; dados históricos desses campos são preservados ao editar. A distância da rota/manual continua disponível para novos fretes. Custos realizados antigos e viagens históricas continuam com sua precedência existente.

Os parâmetros padrão são R$ 7,45/litro e 4,0 km/l: custo estimado = distância em km / 4 × 745 centavos. Exemplo: 400 km = 100 litros = R$ 745,00. A migração atualiza a configuração persistida somente se ainda corresponder aos padrões anteriores de 738 centavos/3200 milésimos. Ajustes administrativos posteriores não são sobrescritos ao reiniciar o sistema.

## Implantação

Aplicar `supabase/migrations/20261021201125_fleet_report_observations_damages_fuel.sql` antes do novo código. O runner inclui a migração no ledger. Mudança aditiva: campos de observação nullable, avarias zero para registros antigos, limites no banco. Mantém RLS e permissões das tabelas existentes; não cria tabela, política pública ou acesso do navegador ao banco.

A reversão de código pode preservar todas as colunas novas. Não remover colunas com observações/avarias já gravadas. A configuração anterior era 738/3200; eventual restauração exige verificar se houve nova alteração administrativa. A mudança não exclui nem transforma dados históricos.

## Verificação

Testes cobrem gravação e reabertura da observação, Sim/Não, vínculo comercial/operacional, notas separadas no PDF agregado, seleção de cliente/período, restrição do vendedor, exportação sob `central_app`, parâmetros e migração idempotente, avarias no resultado e fechamento, formulário sem os campos removidos e preservação de valores históricos ao editar. PDF de QA usa dados fictícios em PostgreSQL local.
