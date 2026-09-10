# Revisão — rateio da frota e interface

Data: 10/09/2026. Branch local: `fix/fleet-rateio-and-interface`.

As alterações estão preparadas para revisão. Nenhum envio ao GitHub, deploy no Render ou alteração de dados em produção foi executado nesta etapa.

## Regra de custo rateado

O custo rateado é o custo fixo mensal de cada caminhão convertido em R$/km. Para cada mês com quilometragem válida, divide-se o custo fixo do mês pelos quilômetros rodados. O parâmetro da placa é a **média simples desses resultados mensais**, sem arredondar a média antes de calcular o frete.

`Histórico mensal da placa → média de custo/km em Parâmetros → km do frete × média da placa`

O histórico serve como base de cálculo; seu valor mensal não é descontado outra vez do faturamento. Combustível, pedágio e comissão permanecem separados. O antigo custo fixo genérico e o rateio de escritório deixaram de participar do cálculo.

Fonte conferida: `OPERACIONAL LOGÍSTICA CENTRAL.xlsx`, abas **Custo Rateado km**, **Parâmetros** e **Fretes**. A cadeia de fórmulas da placa BDC3H60 passa por `Custo Rateado km!E17`, `N4` e `Parâmetros!B13`.

| Mês da base BDC3H60 | KM | Custo fixo mensal | Custo por km aproximado |
| --- | ---: | ---: | ---: |
| Abril | 14.345 | R$ 10.549,63 | R$ 0,735422 |
| Maio | 9.667 | R$ 11.545,84 | R$ 1,194356 |
| Junho | 9.702 | R$ 12.325,32 | R$ 1,270390 |

Média: **R$ 1,066722588…/km**.

| Frete de 1.200 km | Valor |
| --- | ---: |
| Combustível: 1.200 ÷ 3,2 × R$ 7,38 | R$ 2.767,50 |
| Pedágio | R$ 130,00 |
| Motorista/comissão | R$ 200,00 |
| Custo fixo rateado | R$ 1.280,07 |
| Custo total | **R$ 4.377,57** |
| Margem sobre frete de R$ 5.400,00 | **R$ 1.022,43** |

No exemplo de 51,1 km, o rateio é R$ 54,51. Na planilha, **R$ 188,06 é o custo total**, incluindo combustível, pedágio e motorista; não é o rateio isolado.

Parâmetros mostra a média por placa e permite gerenciar a base mensal. Placas sem histórico válido exibem **Base pendente**, sem apresentar custo total ou margem como se estivessem completos. A planilha não foi importada automaticamente no banco de produção.

## Interface e operações

- Preservada a correção da distância: abrir, editar e salvar 1.200 km não transforma a distância em 1,2 km.
- Exclusão de vendas na listagem, para administrador, com confirmação e estilo animado existente.
- Exclusão de recebimentos substitui Estornar. O recebimento sai da lista e dos cálculos, com auditoria preservada. Estornos antigos vinculados são retirados junto do recebimento original.
- Upload verde baseado no botão de Creatlydev/Uiverse, com PDF, JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC e HEIF, até 10 MB. Validação do formato no servidor; anexar não confirma pagamento automaticamente.
- Data do pagamento posicionada acima do upload. Vendedores podem anexar nas próprias vendas; confirmar pagamentos continua restrito aos perfis autorizados.
- Mês atual como padrão em vendas, frota, Financeiro, dashboard, relatórios, exportação e comissões, usando America/Sao_Paulo. A escolha explícita de outro mês continua disponível. O histórico usado no rateio mantém todos os meses da base.
- Frota segue a sequência de custos da planilha: combustível, pedágio, motorista e custo fixo rateado. Em vendas, formulário e detalhe usam a mesma sequência de categorias, com Outras despesas por último. A planilha recebida não contém uma tabela equivalente das categorias NF/ICMS/prestadores de vendas.
- CSS ajustado para alinhamento, quebra de textos e superfícies internas no tema escuro, preservando as animações existentes.

## Validação e pendência

- **52 testes unitários aprovados**, incluindo os exemplos da planilha, seleção de placa, distância ao editar, datas e formatos de comprovante.
- **11 testes de integração aprovados**, incluindo permissões, anexos PDF/imagem, baixa, exclusão com recálculo/auditoria e competência mensal.
- **Build Next.js 16.3.4 e TypeScript aprovados**, em Node 22. ESLint dos arquivos revisados e verificação de whitespace aprovados.
- **Revisão visual em navegador pendente:** o ambiente impediu o servidor de prévia e bloqueou a abertura dos arquivos locais por política. Não houve validação visual de desktop/celular nem teste contra os serviços de produção.

Não há novas dependências, migrações de banco ou variáveis de ambiente necessárias para estas alterações. Próximo passo sujeito à autorização: enviar esta branch ao GitHub e abrir um PR para revisão, sem merge ou deploy.
