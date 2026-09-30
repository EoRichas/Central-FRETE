# Comissão pelo cadastro e acesso às próprias vendas

## Comportamento

Configurações > usuário Vendedor recebe Comissão (%), entre 0 e 100, com até duas casas decimais. Somente Admin altera o cadastro. Os vendedores existentes começam com 7%, o padrão anterior, até a revisão administrativa. O percentual fica salvo em centésimos de ponto percentual.

Novas vendas Cegonha e novos fretes Frota usam o percentual do vendedor cadastrado. O formulário não envia um percentual editável. O servidor ignora tentativas de trocar comissão ou vendedor pelo payload de um usuário não administrador. Em Cegonha, somente Admin escolhe vendedor e status operacional. Vendedor usa sua própria identidade; Operacional registra a própria autoria, sem comissão comercial. O status inicial dos dois é Confirmar.

Admin pode escolher o vendedor em um novo frete da Frota; sem vendedor, a comissão é zero. Gerência conserva seu acesso anterior ao cadastro de frete, sem assumir a identidade de um vendedor. Alterar o percentual no cadastro vale para novas vendas, sem reescrever comissões históricas ou fechamentos salvos. Corrigir valores de uma venda recalcula a comissão com o percentual originalmente registrado; trocar o vendedor de uma venda comercial usa o cadastro do novo vendedor.

A Frota recebe o custo da comissão em seus cálculos de resultado e fechamento atual. O controle de comissões inclui Frota e Cegonha; uma venda comercial vinculada ao frete aparece apenas uma vez, pelo frete e pela competência da coleta. Vendas comerciais sem vínculo usam a competência da venda.

Vendedor acessa Ver detalhes na lista da Frota, com o mesmo conteúdo do popup existente. Isso não libera edição, exclusão, pagamentos ou fechamento. O servidor valida o dono pelo ID do vendedor; Operacional acessa somente vendas e fretes criados pelo seu ID. Nomes iguais não concedem acesso. Clientes continuam compartilhados.

Comissão comercial calculada e percentual ficam visíveis somente a Admin e Vendedor. A restrição também é aplicada nos dados retornados pelas APIs, nos relatórios PDF, no Financeiro e na visão geral. Custos totais e margens mantêm a comissão no cálculo contábil. Comissões dos motoristas preservam as regras anteriores. A prévia de resultado na edição de frete fica restrita a quem recebe o percentual; o resultado confirmado continua disponível após salvar.

## Migração e publicação

Arquivo: `supabase/migrations/20260930164106_seller_commission_access.sql`, registrado no runner. Acrescenta o percentual em users e vendedor/percentual em fleet_freights, com limites e índices. Recupera proprietário comercial legado apenas quando o nome corresponde a um único vendedor; nomes ambíguos ficam para revisão de Admin. Fretes vinculados herdam a comissão já registrada na venda comercial. Fretes históricos sem venda vinculada recebem autoria quando o criador era vendedor e mantêm comissão zero, sem inventar custo retroativo. Nenhum snapshot de OS ou fechamento é reescrito.

Antes de publicar este código, executar `npm run migrate` a partir da versão deste PR, com DATABASE_URL e demais variáveis protegidas do ambiente. Na Vercel, isso precisa de etapa separada: o deploy Next não executa o startup personalizado do Render. Validar o cadastro dos percentuais antes de registrar novas vendas.

A migração de produção não foi executada nesta entrega. Fazer backup antes de aplicá-la. Em rollback de código, preservar as colunas e os novos dados; não remover informações de comissão ou autoria. A versão anterior usa regras de acesso e comissão diferentes, portanto uma correção progressiva é preferível após iniciar uso.

## Validação

Testes de integração cobrem percentuais inválidos, cadastro/edição administrativa, comissão da sessão, payload forjado, preservação histórica, próximo cadastro usando nova taxa, cálculo Frota, listagens e detalhes próprios, homônimos, anexo alheio, relatórios e omissão dos campos para outros perfis. Migrações executadas duas vezes em PostgreSQL embarcado. Testes não usam dados de produção.

Resultado: 57 testes de integração e 49 testes de domínio/PDF/sessão aprovados. Build e TypeScript aprovados; lint sem erros, com seis avisos preexistentes.

Conferência em Chromium/Playwright com respostas sintéticas: popup da Frota em 1440×1000 e 390×844, comissão automática em novos fretes e vendas, campos ausentes para vendedor/operacional, Financeiro sem coluna de comissão nem NaN e edição do percentual pelo Admin. Dados sintéticos de interface complementam os testes reais dos endpoints em PGlite; não representam validação em produção.
