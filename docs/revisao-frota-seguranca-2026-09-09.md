# Revisão dos cálculos da Frota e das dependências

Status da validação: concluída localmente. Sem merge, acesso aos registros reais ou deploy no Render. A conferência visual permanece pendente.
Branch: `fix/fleet-calculation-consistency`.
Base inicial usada na revisão: `db9aea0fc8fac0b990dd8d0d6e0599da2d1ac566`.
Envio preparado sobre a main atualizada: `f5448f3392838f9b24e306dbd85b43be54cc5320`, preservando os ajustes visuais recentes.
A atualização de dependências já está na main pelo PR #17 (commit `a74cd64f9d348493a783b75f0a5a4e413f7e20b5`) e não é reaplicada no diff desta revisão. Os testes remotos de CPF/homônimos também foram preservados.

## Causas identificadas

1. A distância salva em metros era formatada como `1.200` km ao editar. O parser interpretava esse texto como `1.2`, dividindo por mil a distância reenviada e os custos proporcionais. A mesma formatação era usada no resultado da consulta de rota.
2. A prévia do rateio usava o valor anteriormente salvo; fretes novos recebiam zero na prévia. Mudar os km ou a data da coleta não recalculava essa parcela.
3. A média dos custos mensais do veículo substituía o custo fixo por km dos Parâmetros. Um lançamento de histórico podia, portanto, aumentar muito o custo dos fretes.
4. O combustível já vinha dos Parâmetros, mas era calculado sobre a distância interpretada incorretamente. Sem configuração, os padrões do projeto são R$ 7,38/l, 3,2 km/l e R$ 0,45/km. Não foi consultada a configuração efetivamente salva na produção.

## Regras corrigidas

| Parcela | Cálculo | Origem |
| --- | --- | --- |
| Combustível | km ÷ consumo em km/l × preço por litro | Parâmetros |
| Custo fixo | km × custo fixo por km | Parâmetros, sem substituição pelo histórico |
| Rateio do escritório | custo mensal × km do frete ÷ km de todos os fretes da mesma competência | Parâmetros; competência pelo mês da coleta |
| Custo total | combustível + fixo + rateio + pedágio + motorista/comissão | Parcelas anteriores e valores do frete |
| Margem líquida | valor do frete − custo total | Valores acima |

O rateio é recalculado na prévia e no servidor. Ao editar, a versão do formulário substitui a versão salva no denominador, sem contar o frete duas vezes. Trocar a data da coleta considera o novo mês. O fechamento em centavos preserva o total mensal.

O campo de distância é reaberto sem agrupamento de milhar (`1200`), mas também aceita `1.200`. Para decimais, usar vírgula: `1200,5`. A conversão de ida e volta mantém a precisão em metros, inclusive no retorno da consulta de rota.

A aba Custo rateado agora apresenta somente o rateio e sua base em Parâmetros. A seção de histórico e seus controles foram retirados dessa tela. Tabelas, registros e APIs legadas não foram apagados; a média histórica não é mais usada na composição dos custos.

## Exemplo reproduzido

Para 1.200 km, frete de R$ 5.400,00, combustível de R$ 7,38/l, consumo de 3,2 km/l, fixo de R$ 0,45/km, pedágio de R$ 130,00 e motorista de R$ 200,00:

- Combustível: R$ 2.767,50.
- Custo fixo: R$ 540,00.
- Total antes do rateio do escritório: R$ 3.637,50.
- Margem antes do rateio: R$ 1.762,50, ou 32,64%.

Com escritório de R$ 1.200,00/mês e dois fretes de 1.200 km e 600 km no mesmo mês, o rateio é R$ 800,00 e R$ 400,00. O custo total do primeiro frete passa a R$ 4.437,50. Com apenas um frete de distância positiva no mês, ele absorve todo o custo mensal do escritório.

Não há correção artificial de margem negativa: ela continua possível quando os custos configurados superam o faturamento.

## Configuração e dados antigos

- É necessário informar o **Custo fixo mensal do escritório** em Parâmetros para haver rateio. Campo vazio agora gera aviso; zero explícito significa ausência desse custo. Nenhum valor foi inventado ou gravado na produção.
- Combustível e escritório devem ser cadastrados em seus próprios campos, evitando incluí-los novamente no custo fixo por km.
- Os Parâmetros continuam globais: alterá-los recalcula os fretes consultados, inclusive históricos. Não foi introduzido congelamento de parâmetros por competência.
- Fretes eventualmente salvos com distância incorreta precisam de revisão individual. Não é seguro multiplicar automaticamente todos os registros por mil.
- Licenciamento, carência, vencimento, cobrança e PDF do certificado não foram alterados nesta correção da Frota.

## Verificações executadas

Ambiente de validação: Node.js 22.23.0.

| Verificação | Resultado |
| --- | --- |
| Testes unitários e regressões (`npm test`) | 50 aprovados |
| Integração com PostgreSQL em memória (`npm run test:integration`) | 7 aprovados |
| Build de produção (`npm run build`) | Aprovado com Next.js 16.3.4 |
| TypeScript (`npm exec -- tsc --noEmit`) | Aprovado |
| ESLint nos arquivos alterados | Sem erros ou avisos |
| ESLint geral | Sem erros; 7 avisos de navegação em componentes fora desta correção |
| Instalação pelo lockfile (`npm ci --include=dev`) | Concluída |
| Auditoria completa / produção | 0 / 0 alertas após correção das dependências |
| Conferência visual no navegador | Pendente por limitação do ambiente de prévia |
| Sessão autenticada e dados reais no Render | Não acessados |

Os testes incluem criação e reedição do frete via APIs, manutenção de 1.200.000 metros, igualdade entre prévia e resultado do servidor, mudança dos Parâmetros, histórico de valor alto sem influência nos custos e leitura pelo Financeiro. As permissões e os testes de cobrança existentes continuaram aprovados.

A validação visual não foi substituída por outro mecanismo de controle: a habilidade `control-browser` exige o navegador autorizado, e seu ambiente não permitiu inicializar a prévia local. Não há alegação de teste visual concluído.

## Segurança das dependências

A auditoria inicial reproduziu 24 pacotes sinalizados no total e 5 na árvore de produção. Após correções compatíveis, ambas retornaram zero. Isso não equivale a uma garantia de ausência de vulnerabilidades na aplicação.

- `next` e `eslint-config-next`: 16.2.6 → 16.3.4.
- Dependências transitivas corrigidas incluem Sharp 0.35.4, PostCSS 8.5.23, nanoid 3.3.18 e baseline-browser-mapping 2.11.21.
- Atualizações compatíveis também corrigiram Babel, brace-expansion, browserslist, esbuild e js-yaml.
- A reconciliação do lockfile removeu cadeias órfãs de ferramentas como Cloudflare/Vinext/Drizzle que não eram dependências atuais do manifesto.
- Não foi usado `npm audit fix --force` nem efetuado deploy.

Referências oficiais: [release Next.js 16.3.4](https://github.com/vercel/next.js/releases/tag/v16.3.4) e [atualização de segurança de agosto de 2026](https://nextjs.org/blog/august-2026-security-release).

## Antes de publicar

1. Autorizar o envio da branch e sua revisão no GitHub.
2. Concluir a conferência visual da criação/edição de frete e da aba Custo rateado em ambiente de prévia autorizado.
3. Publicar somente após aprovação, reunindo os ajustes para evitar deploys desnecessários.
4. Conferir os valores de Parâmetros e os fretes possivelmente afetados pelo parser antigo, sem alterações em massa presumidas.
