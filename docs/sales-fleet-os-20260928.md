# Vendas Cegonha, Frota e Ordem de Serviço

Implementação baseada na main de5513a. Não foi aplicado deploy ou migration em produção.

## Comportamento

- Um contador PostgreSQL transacional compartilha a sequência entre Cegonha e Frota, sem reinício anual. Banco vazio ou maior número até 200 produz 201, 202, 203. Rollback devolve o incremento; exclusão não reutiliza números.
- A migration 012 inicia o contador pelo maior identificador numérico existente ou 200. Vendas anuais sem OS são renumeradas por sale_date, created_at e id. Vendas com versões de OS conservam o identificador histórico. A próxima venda pode superar 201 quando houver números maiores ou conversões de registros existentes.
- Listas comerciais filtram sale_channel. Financeiro e Relatórios continuam consultando ambos os canais. Ordenação numérica e alternativas de data/valor ocorrem no servidor antes do limite.
- VENDEDOR usa a área Frota em modo comercial, com o mesmo formulário e escopo de suas vendas. A API operacional /api/fleet permanece bloqueada para esse perfil, incluindo veículos, motoristas e fechamentos. ADMIN acessa a aba Vendas na Frota e pode vincular posteriormente a venda à operação existente.
- OPERACIONAL cria Cegonha e seleciona um vendedor ativo por ID. Não pode criar Frota, cadastrar clientes, emitir OS, excluir vendas ou registrar recebimentos. Consulta clientes e opções de vendedor sem acessar a administração de usuários.
- Nota Fiscal, Seguro e ICMS são pagos automaticamente. CTE/MDF possui categoria e controle próprios. Valores legados combinados permanecem identificados, sem divisão inventada. Prestadores em aberto mantêm confirmação e status consistentes.
- O painel mostra apenas registros de custo com valor positivo. Edição continua no formulário compartilhado, com categorias históricas preservadas.

## OS

Um único renderizador atende Cegonha, Frota e snapshots antigos. Novas emissões usam schemaVersion 2, layoutVersion central-express-20260928, totais e registros de custos capturados em uma consulta MVCC. Comissão do vendedor não integra o custo da operação.

Alterações nos custos tornam a OS desatualizada. Emitir novamente cria uma versão; consultar versões anteriores usa somente o snapshot. A emissão tem auditoria transacional. A autorização da OS segue as permissões comerciais existentes.

A4 vertical, fundo proporcional em todas as páginas, cabeçalho centralizado, textos selecionáveis, área segura e paginação. Identificação/chassi e previsão de chegada não são impressos. O tipo de trajeto é derivado de origem/destino por função de domínio. A seção Operação e valores apresenta frete, custo total, Seguro, Nota Fiscal, ICMS e CTE/MDF, além do legado combinado quando existir.

Assets:

- public/service-order-background-portrait.pdf: PDF fornecido posteriormente, com imagem JPEG incorporada de 1054 x 1492 px; aplicado como página PDF, sem rasterização adicional. O PNG inicial permanece como referência.
- public/service-order-footer-reference.png: detalhe de referência do rodapé, não é fundo horizontal.

O PDF recebido contém imagem raster, não arte vetorial, e corresponde a aproximadamente 128 dpi em A4. Essa resolução limita a nitidez do timbrado; os textos gerados pelo sistema usam fonte incorporada e permanecem nítidos. Substituir futuramente o asset por original de alta resolução com as mesmas proporções e posições. Os dados demonstrativos dos PDFs de QA não representam uma venda real.

## Banco e aplicação

Nova migration: database/012_sales_channels_global_numbering_costs.sql. Adiciona sale_channel, índice por canal/competência, contador global e normalização dos pagamentos. Mantém o contador anual como legado. Não edita migrations antigas nem snapshots históricos.

O runner registra scripts em central_schema_migrations e grava o registro na mesma transação de cada migration. Isso impede que scripts antigos restaurem o contador anual ou marquem custos CTE/MDF como pagos em reinícios. A primeira adoção executa os scripts ainda não registrados. A tabela de controle e o contador têm RLS e acesso revogado para anon/authenticated.

A migration obtém bloqueio EXCLUSIVE em freight_sales para serializar renumeração e emissão de OS. Exige janela de manutenção, backup e autorização antes de produção. Pode aguardar transações em curso. Não executar arquivos antigos isoladamente depois da 012.

Rollback operacional: parar escritas e restaurar aplicação e banco do backup consistente. Não restaurar apenas o contador anual: novas vendas e versões emitidas já dependem do contrato novo. Preferir correção incremental após uso do novo schema.

## Arquivos principais

- Domínio: lib/domain/sales.ts, permissions.ts, operations.ts e service-order.ts; lib/contracts.ts.
- Backend: lib/server/repository.ts, service-orders.ts e service-order-pdf.ts; rotas sales, edição, custos, opções de vendedor e exportação.
- Interface: components/app-shell.tsx, sales-screen.tsx, sale-form-screen.tsx, sale-detail-screen.tsx, fleet-screen.tsx e rota /frota/vendas/nova.
- Implantação: scripts/migrate-postgres.mjs e next.config.ts, com inclusão do novo fundo no bundle do PDF.

## Verificação

- npm test: 46 testes unitários, incluindo regras de categoria/permissão e PDFs schema 1/2.
- npm run test:integration: 31 testes com PostgreSQL embarcado (PGlite), incluindo endpoints, sessões, transações, migração, 201/202, rollback, solicitações concorrentes, escopos de acesso, snapshots e execução única do runner.
- npm run lint: sem erros; seis avisos em navegação e imagem preexistentes.
- npm exec -- tsc --noEmit e npm run build: executados para validar tipos e build.
- PDFs renderizados e inspecionados: exemplos simples com duas páginas; carga de 100 veículos com 15 páginas. Extração confirma textos pesquisáveis, um fundo por página, ausência de identificação e previsão de chegada e conteúdo acima do rodapé.

Limites: os testes PGlite serializam as transações e não substituem um ensaio com múltiplas conexões em PostgreSQL de homologação. Não houve teste de navegador autenticado nem teste em banco real de produção.
