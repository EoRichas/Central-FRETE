# Frota na Vercel: erro de esquema e carregamento

## Incidente confirmado

Os logs PostgreSQL de 29/09/2026, 18:37 UTC, registraram `column "client_id" does not exist`. O PR #67 estava integrado à main, mas a migração `20260929175656_fleet_client_reference.sql` não aparecia no controle de versões do banco.

A migração já aprovada no PR #67 foi aplicada ao projeto Supabase Central-FRETE, com trava compatível com o runner e registro em `central_schema_migrations`. A coluna e o índice foram confirmados por consulta posterior. Nenhum registro de frete foi alterado ou apagado. A tabela estava vazia antes e depois. O acesso continua pelo backend; RLS e permissões não foram ampliados. Advisors retornaram apenas os avisos informativos já esperados de RLS sem políticas nas tabelas privadas ao backend.

A validação direta no banco passou. Não foi usada uma sessão de usuário para conferir a página em produção.

## Mudanças de carregamento

1. `vercel.json` define funções em `gru1` (São Paulo). O banco informado pelo Supabase está em `sa-east-1`; a resposta pública de `/api/health` da aplicação mostrou execução em `iad1` antes da alteração. Essa configuração entra em vigor no próximo deploy do PR.
2. O shell passa a sessão já carregada às páginas. A abertura da Frota deixa de esperar outra consulta de `/api/me` antes de carregar os dados. Revalidação a cada 30 segundos, ao focar a janela e ao navegar permanece. As APIs continuam autorizando cada operação no servidor. Não há cache persistente de permissão.
3. Chamadas de sessão simultâneas fora do contexto compartilham somente a requisição em andamento, com respostas independentes. Respostas antigas de consultas abortadas não substituem o estado atual.
4. A consulta de fretes filtra a competência no PostgreSQL, incluindo coleta, faturamento e viagens relevantes. Preserva todos os membros de uma viagem para manter o rateio mesmo com datas em meses diferentes. A consulta sem competência continua disponível. Histórico de custos por placa permanece completo, pois define a média histórica.

Não há promessa de redução percentual ou tempo máximo. No banco consultado não havia fretes para um benchmark representativo. O plano da consulta mensal foi validado com EXPLAIN ANALYZE; a amostra vazia confirma sintaxe, não capacidade sob carga. Os índices existentes cobrem coleta, faturamento, viagens e suas datas.

## Publicação e prevenção

Esta atualização não precisa de nova migração. A migração faltante do PR #67 já foi aplicada. Em futuras versões com migrações, executar `npm run migrate` com a conexão protegida antes de publicar a aplicação. Na Vercel o deploy Next.js não executa o script customizado de `npm start` que era usado no Render.

Depois do deploy, confirmar que as funções estão em São Paulo e medir páginas autenticadas na aba Network, separando `/api/me`, `/api/fleet`, listagem de vendas e tempo de renderização. A região de build não comprova a região das funções. Não usar apenas o endpoint de saúde como benchmark do banco.

## Verificação

53 testes de integração e 49 testes de domínio/PDF/sessão aprovados. A consulta mensal foi comparada à consulta de todo o histórico em cinco meses, incluindo fretes que compartilham viagem com coleta e faturamento em meses diferentes. Build/TypeScript e lint verificados; seis avisos antigos, sem novos erros.

Conferência Chromium/Playwright com dados sintéticos confirmou uma única consulta de sessão em cada abertura da Frota e de Nova venda, sem erros JavaScript.

Referências oficiais: [região das funções](https://vercel.com/docs/functions/configuring-functions/region), [regiões disponíveis](https://vercel.com/docs/regions), [EXPLAIN no PostgreSQL/Supabase](https://supabase.com/docs/guides/database/inspect).
