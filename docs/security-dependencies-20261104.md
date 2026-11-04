# Dependências e indexação — 4 de novembro de 2026

## Escopo e evidência

Revisão solicitada das 14 ocorrências apresentadas pela Hostinger para
`EoRichas/Central-FRETE` e da nota 33/100 da avaliação de acesso por agentes.
Base: `cc282005c4802792e5ed21e925981b86eaa41042` (`main`).
Foram inspecionados código, lockfile, avisos dos mantenedores e respostas HTTP
públicas. Não foram executados exploits, testes de carga, gravações no banco ou
alterações de credenciais. A presença de um pacote afetado não demonstra que a
condição necessária à exploração exista nesta aplicação.

Em produção, `https://centralexpressfrete.com.br/robots.txt` retornou **404**.
A entrada `/` redirecionou para `/inicio`, cuja resposta continha tanto
`X-Robots-Tag: noindex, nofollow, noarchive` quanto a meta tag `noindex` no HTML.
Portanto, a ausência de robots.txt era real; a política de não indexação já
estava publicada. Conferência em 04/11/2026, aproximadamente 15h49 de Brasília.

## Tratamento das ocorrências da captura

| Pacote observado | Ocorrências | Tratamento |
| --- | ---: | --- |
| Next.js 16.3.8 | 3 | Next.js e eslint-config-next 16.4.5, incluindo correções publicadas em 03/11. |
| sharp 0.35.4 | 1 | sharp 0.35.5 e seus binários transitivos. |
| zod 4.4.3 | 1 | zod 4.6.7. |
| brace-expansion 1.1.18 e 5.0.9 | 6 | Respectivamente 1.1.21 e 5.0.12; são três avisos repetidos em duas versões. |
| source-map-js 1.2.1 | 1 | source-map-js 1.2.2. |
| minimatch 10.2.5 | 1 | Override restrito à linha 10 para 11.0.1; compatibilidade verificada com ESLint e build. |
| minimatch 3.1.5 | 1 | Não afetado por este aviso segundo a faixa corrigida da base oficial em 04/11: `>=7.0.0 <11.0.1`. Mantido para compatibilidade com consumidores legados. |

O override não substitui a API antiga do minimatch 3 pela API incompatível da
linha 11. O lockfile mantém as duas linhas necessárias. Não há exclusão de
avisos nem uso de `npm audit fix --force`. A CI passa a executar a auditoria
completa e reprova avisos moderados ou superiores.

A PR #121 permanecia aberta e alterava somente a versão de Next.js para 16.4.1
no manifesto, deixando o lockfile antigo. Esta correção inclui o lockfile
consistente e cobre os demais pacotes; não deve ser seguida por uma mesclagem
que reverta Next.js à versão anterior.

## Por que a nota 33/100 não mede segurança

As categorias da captura premiam descoberta e utilização pública por agentes:
sitemap, dados estruturados, preços, perfis públicos, llms.txt, Markdown e MCP.
São critérios de divulgação/integração, não evidência de falha de autenticação,
isolamento de dados ou proteção contra execução de código.

Para este painel privado, promover indexação ou expor interfaces apenas para
aumentar a nota contrariaria o objetivo de manter o sistema fora da busca.
Ausência de sitemap, JSON-LD comercial, llms.txt ou MCP não constitui uma
vulnerabilidade por si só.

O novo `public/robots.txt` bloqueia rotas operacionais e APIs. Para buscadores
comuns, permite apenas `/`, `/inicio`, `/login` e os arquivos estáticos do Next
necessários aos pontos de entrada, para que possam processar a regra noindex.
Os agentes de IA explicitamente listados recebem `Disallow: /` sem exceções.
Nenhuma dessas regras substitui autenticação nem obriga robôs maliciosos a
respeitá-las. O gateway corporativo continua se aplicando ao robots.txt se
estiver habilitado; não foi criada exceção de autenticação.

## Validação

- `npm ci --include=dev`: instalação limpa pelo lockfile concluída.
- `npm audit --json`: zero avisos, incluindo desenvolvimento, na consulta feita
  em 04/11/2026. Isso não equivale a uma auditoria de segurança completa do SaaS.
- `npm test`: 130/130 aprovados.
- `npm run test:integration`: 113/113 aprovados em laboratório local.
- `npm run build`: produção compilada com Next.js 16.4.5 e dois workers.
- Smoke HTTP do build: robots.txt 200/text/plain; login 200 com noindex no HTML
  e cabeçalho; rota inexistente 404; `/api/me` sem sessão retorna 401/no-store.
- Quatro testes de interface também falhavam no checkout base com as
  dependências antigas. Foram atualizados os mocks dos filtros e do ícone de
  busca, preservando as verificações de combinação, edição e exclusão.
- O lint completo encontra um erro preexistente em
  `components/support-workspace.tsx:127` (`react-hooks/set-state-in-effect`) e
  avisos. O mesmo erro foi reproduzido na base com eslint-config-next 16.3.8.
  O comportamento do suporte não foi alterado por esta atualização.

## Publicação e reteste

Após mesclar esta correção em main, reimplantar na Hostinger usando o novo
commit. Confirmar nos logs Next.js 16.4.5, consultar `/robots.txt` e a presença
de noindex e repetir o scanner de dependências. Se minimatch 3.1.5 continuar
listado para CVE-2026-118764, conferir a data da base do scanner: a faixa
oficial foi corrigida em 04/11. Não é necessário trocar variáveis de ambiente
nem migrar dados. O resultado local não comprova que a nova versão já esteja
em produção.

## Referências primárias

- https://github.com/vercel/next.js/releases/tag/v16.4.5
- https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
- https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr
- https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r
- https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- https://github.com/advisories/GHSA-q2hr-2g5m-vwhr
- https://github.com/advisories/GHSA-qhr7-859c-m2p7
- https://github.com/advisories/GHSA-6j4f-fj2g-mc7p
- https://github.com/advisories/GHSA-68fv-2mgg-jv7q
- https://github.com/advisories/GHSA-g3hv-75wg-m249
- https://developers.google.com/search/docs/crawling-indexing/block-indexing
