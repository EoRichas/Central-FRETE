# OS comercial e ajustes da Frota

Continuação da PR #57, incorporada à main em 28/09/2026 (4829370). Referências: PDF comercial asdasf.pdf e cinco capturas enviadas pelo usuário. Nenhum dado do cliente de exemplo foi copiado para o código.

## OS para o cliente

Novas emissões usam schemaVersion 3 e layout central-express-client-20260928. Conteúdo: data/número da venda, cliente, documento, e-mail do contato principal disponível, endereço, serviço/rota, modelos e placas, valor unitário/subtotal, total/valor líquido, forma de pagamento, parcelas, vencimento, condições do transporte e observações. O timbrado PDF Central Express aprovado permanece.

Não imprime identificação/chassi, custos operacionais/fiscais, comissão, margem, previsão de chegada ou data de entrega. O prazo é o número de dias informado na venda: não se presume um marco inicial nem dias úteis não cadastrados. As condições adicionais podem ser registradas nas observações. O frete é um serviço de quantidade 1 contendo todos os veículos da carga, pois o sistema não possui preço por veículo e não deve inventar uma divisão.

O exemplo comum cabe em uma página. Cargas extensas ou muitas parcelas continuam paginadas dentro da área segura. O renderer anterior foi preservado exclusivamente para versões 1/2 já emitidas. Para uma venda com OS antiga, gerar uma nova versão para obter o documento comercial atualizado. Snapshots antigos não são reescritos. Alterações de custos internos não desatualizam a nova OS.

## Frota e custos

Após cadastrar ou editar um frete, a consulta apresenta status, Dados da operação, Composição financeira e custos preenchidos, seguindo o padrão da venda Cegonha. A competência acompanha a data de coleta salva para que o novo registro seja encontrado. A rota na listagem abre a consulta, e a edição permanece uma ação separada.

Seguro, Nota Fiscal, ICMS e CTE/MDF possuem campos próprios no cadastro e edição da operação Frota. Seus valores são armazenados em centavos, validados no servidor, auditados e somados ao custo direto, resultado, viagem e fechamento. Campos omitidos em PATCH preservam valores anteriores. Os mesmos custos já existentes no formulário comercial Cegonha/Frota continuam disponíveis. Não há cópia automática entre custos de uma operação e de uma venda vinculada.

O editor compartilhado de veículos mostra somente modelo e placa. Identificações históricas continuam armazenadas, sem serem apagadas por edição. A grade do resumo de custos passa de duas para três colunas para acomodar os três indicadores; mantém uma coluna no celular.

## Distância por CEP

Ao completar os dois CEPs, o formulário consulta automaticamente a distância rodoviária. A integração Google existente continua preferencial quando GOOGLE_MAPS_API_KEY estiver configurada. Sem chave, o servidor consulta coordenadas da BrasilAPI CEP v2 e a rota OSRM. Não usa distância em linha reta nem coeficiente aproximado.

OSRM_BASE_URL permite uma instância própria. O padrão público é https://router.project-osrm.org; serviços públicos não oferecem garantia de disponibilidade e o perfil de rota é de automóvel, sem validação de restrições específicas de caminhão. A estimativa não é uma instrução de navegação. CEPs sem coordenadas ou falhas externas deixam a distância disponível para preenchimento manual, com aviso. Coordenadas e rotas bem-sucedidas têm cache limitado e requisições simultâneas iguais são consolidadas.

Quando KM inicial e final estão presentes, a distância exibida e salva é a diferença entre ambos. O campo fica somente leitura, a consulta automática é suspensa e route_distance_meters é salvo como null. O servidor aplica a mesma regra mesmo sem passar pela interface. KM final inferior ao inicial continua inválido; zero é aceito. Respostas atrasadas são ignoradas após alterar CEP, distância ou odômetro.

Documentação consultada: https://brasilapi.com.br/docs e https://project-osrm.org/docs/v5.24.0/api/.

## Migração e publicação

Nova migration database/013_fleet_document_costs.sql, registrada no runner scripts/migrate-postgres.mjs. Adiciona quatro colunas com padrão zero e limites monetários sem alterar valores históricos. Deve rodar antes de servir o código novo; o comando de início existente executa o runner. Não foi aplicada em produção. Rollback de código pode manter as colunas adicionais; não as remover se já houver valores preenchidos.

## Verificação e limites

- 47 testes unitários e 33 de integração passaram, incluindo cadastro/edição dos quatro custos, totais, permissões, auditoria, migração idempotente, odômetro e contrato da rota pública sem chave Google.
- TypeScript e build aprovados. Lint sem erros, seis avisos preexistentes.
- PDF comercial renderizado e inspecionado; exemplo de uma página e versões históricas preservadas.
- Integrações externas testadas com respostas controladas. A rede deste ambiente bloqueou consultas reais à BrasilAPI; validar uma rota real no ambiente de implantação.
- Navegador de teste indisponível: instalação local do Chromium falhou e o navegador remoto bloqueou localhost. Não houve verificação visual/interativa da interface nem teste autenticado em produção.
