# Busca de clientes e cadastro de frete pelo vendedor

## Comportamento

O formulário de venda e o formulário de frete da Frota usam um único campo de cliente com sugestões conforme a digitação. A consulta começa em dois caracteres, espera 250 ms e cancela buscas anteriores. Busca nome, razão social, nome fantasia e CPF/CNPJ; aceita nomes sem acento e documentos com ou sem pontuação. Consulta todo o cadastro e mostra até 20 sugestões, com aviso para refinar quando houver mais resultados.

A tela determina o canal, sem escolha adicional na busca. Frota recebe clientes ativos FROTA/AMBOS; Cegonha recebe CEGONHA/AMBOS. O servidor também valida a associação. Um nome digitado sem seleção não vira um cliente cadastrado. A venda mantém a possibilidade anterior de deixar o cliente em branco. Novo frete exige seleção.

Fretes anteriores conservam seu nome histórico. Não são associados automaticamente por nome, pois podem existir homônimos. Ao editar sem trocar o cliente, o vínculo anterior continua permitido mesmo após inativação/reclassificação. Se trocar, deve escolher um cadastro elegível. O cadastro rápido da venda só seleciona automaticamente um novo cliente ativo e compatível com o canal.

Os atalhos “Cegonha” e “Frota” acima da listagem de vendas foram removidos conforme a imagem enviada. URLs e dados históricos permanecem disponíveis.

## Acesso do vendedor

O vendedor entra na aba **Frota** e usa **Novo frete**, que abre o mesmo formulário de cadastro operacional utilizado pela administração. O botão salva em `fleet_freights`, com numeração global automática e autoria do usuário autenticado. Não cria outra venda comercial automaticamente.

A tela do vendedor lista os últimos 100 fretes que ele criou. Dados de terceiros, pagamentos, fechamento, histórico de custos, documentos pessoais dos motoristas, edição e exclusão administrativa não são liberados. A consulta para preparar o formulário retorna somente placas, nomes dos motoristas e parâmetros necessários ao cálculo. O cálculo por CEP também fica disponível no cadastro.

## Referências da interface

| Referência | Decisão aplicada |
| --- | --- |
| Imagem 20260929-175308 e formulários existentes | Substituir entrada duplicada e select por uma única busca; manter cores, bordas e grade existentes |
| Imagem 20260929-180618 | Retirar os dois atalhos de canal do topo da listagem |
| [WAI-ARIA Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) | Rótulo, listbox, opção ativa, setas, Enter e Escape; estados de carregamento, vazio e erro |

## Banco e publicação

Migração expansiva `supabase/migrations/20260929175656_fleet_client_reference.sql`, criada pelo CLI Supabase e registrada no runner. Acrescenta `fleet_freights.client_id`, referência a `clients` com `ON DELETE SET NULL`, e índice. Preserva nomes, numeração, snapshots e RLS. Não relaciona automaticamente registros antigos por texto.

Aplicar `npm run migrate` com as variáveis protegidas do ambiente antes de publicar este código. No startup Render, o script existente já executa as migrações. Na Vercel, o Next.js não executa `npm start`, portanto a migração precisa de uma etapa separada. Não colocar segredos no GitHub ou em variáveis `NEXT_PUBLIC_*`. A migração de produção não foi executada nesta entrega.

Rollback de código pode manter a coluna adicional. Não remover a coluna depois de registrar novos vínculos.

## Validação

52 testes de integração PGlite e 48 de domínio/PDF aprovados. As migrações foram reaplicadas no banco local. Cobertura inclui canais, acentos, CPF/CNPJ, busca além dos primeiros 300 clientes, limite de sugestões, tentativa de wildcard, cliente inativo/incorreto/inexistente, nome canônico, edição histórica e criação/escopo/permissões do vendedor.

Build e TypeScript aprovados; lint sem erros, com seis avisos preexistentes. Conferência local com Chromium/Playwright em 1440×1000 e 390×844, temas claro/escuro: busca única em venda, consulta Frota, seleção por teclado e clique, Escape, estados vazio/erro, envio do cadastro com clientId, atualização da lista e retirada dos atalhos. Sem erro JavaScript e sem transbordamento horizontal no viewport móvel. Dados e respostas usados na conferência são sintéticos; não constitui validação de desempenho ou publicação em produção.
