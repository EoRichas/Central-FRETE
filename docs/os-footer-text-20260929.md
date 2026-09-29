# Rodapé da OS com texto uniforme

Solicitação de 29/09/2026, após o PR #63: retirar a linha Emitida em/data/OS e substituir os textos rasterizados de contato por texto nítido, como já acontecia com o telefone.

- Remove a linha de emissão do rodapé no modelo atual (schema 3). Número/data da venda no cabeçalho e paginação continuam disponíveis.
- Reescreve endereço, telefone, e-mail e site com Noto Sans regular incorporada, tamanho 9,5, mesma cor e alinhamento.
- Cobre os textos rasterizados antes de escrever, com fundo correspondente ao timbrado. Preserva ícones, linha vermelha, logotipo e marca-d'água.
- Mantém endereço, e-mail e site existentes no modelo, sem alterar os contatos. O telefone continua vindo do snapshot da vendedora/criador, conforme PR #63; ausente permanece não informado. Documentos anteriores sem fonte de contato preservam o telefone fixo original quando não há contato salvo.
- Não altera dados, snapshots, regras de emissão ou modelos históricos schema 1/2. O ajuste aparece ao abrir/imprimir PDFs do modelo atual depois da implantação, sem gerar outra emissão.

Validação: quatro testes de PDF/domínio aprovados; TypeScript e lint do arquivo sem erros; diff conferido. PDF de uma página e última página de caso extenso inspecionados visualmente. Extração do caso de 17 páginas confirma os contatos uma vez em cada página e ausência da linha de emissão. A fonte Helvetica de sistema foi substituída por Noto incorporada após a inspeção mostrar espaçamento irregular no renderizador.

Sem migração, merge, deploy ou alteração de dados de produção.
