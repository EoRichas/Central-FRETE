# Frota, comissões, relatórios e comprovantes

- Frota: filtro financeiro (Em aberto/Pago/Faturado) substitui Prioridade somente na consulta. Os campos e prioridades dos fretes permanecem disponíveis na edição.
- Pago tem precedência; Faturado significa que há data de faturamento ou status operacional Faturado e o frete ainda não está pago. Os registros não são alterados pelo filtro.
- Consulta da Frota por período inclusivo de coleta, incluindo meses/anos diferentes. O vendedor consulta apenas seus próprios fretes, sem o antigo limite de 100 quando usa período. Chamadas antigas sem período mantêm a compatibilidade.
- Financeiro e baixa por lote filtram por data da venda (Cegonha/venda comercial sem vínculo) ou coleta (frete Frota). O modal tem intervalo próprio, mantém o canal escolhido e não limita a quantidade selecionada. A data do recebimento continua separada.
- Faturamento deixa de aparecer como aba da Frota. A comissão do motorista, calculada pela coleta, passa para Comissões > Comissão motoristas.
- Comissões possui abas no padrão compartilhado. A consulta de comissão de vendedores mantém os escopos e a baixa individual existentes; Financeiro/Gerência acessam somente a aba dos motoristas. Não foi criado um processo de pagamento de comissão de motorista.
- Relatórios > Relatório motorista / Relatório veículo ficam ao lado de Relatório de prestadores. Datas, motorista e veículo filtram consulta e PDF A4 vertical, com visualização antes de imprimir. O endpoint permite ADMIN, GERENCIA, FINANCEIRO e OPERACIONAL e não retorna dados pessoais nem comissão de vendedor. Homônimos e registros históricos permanecem separados por identificação.
- No relatório consolidado de vendas Frota, a coluna da data inclui o número da venda. Mantém a data de criação e os demais campos existentes. A OS individual é preservada.
- Veículos e motoristas continuam empilhados, cada lista com sua rolagem vertical. O editor do veículo deixa de mostrar histórico mensal; os registros históricos e cálculos permanecem no banco.
- No pagamento do frete, Comprovantes é uma seção recolhível. Um único comprovante existente é aproveitado; havendo vários, a seleção fica na seção. O arquivo novo e a situação são enviados por uma única ação de confirmação, e o comprovante permanece opcional. Se upload funcionar e atualização de pagamento falhar, a repetição reutiliza o arquivo salvo.

Não há migração de schema ou alteração em dados de produção. O PR não inclui credenciais, dados reais ou capturas de produção.

Validação: testes de domínio/componentes, integração em PostgreSQL local (PGlite), tipos, build, PDFs renderizados e revisão visual dos componentes reais com dados fictícios. Lint dos arquivos alterados sem erros; lint global possui erro anterior em `components/support-workspace.tsx` (`react-hooks/set-state-in-effect`), fora deste escopo.
