# Relatório por cliente, avisos financeiros e suporte

## Escopo

Somente Central-FRETE. Não altera CZAR/EKON, Sup, os dados existentes, permissões de alteração nem regras de faturamento. A atualização do campo Situação do serviço usa a migração aditiva 017; não requer bucket, dependência ou variável de ambiente nova.

## Relatório de vendas do Frota

- Aba ao lado de Faturamento, nos mesmos perfis que já consultam essa área completa da Frota.
- Consulta interna por um cliente cadastrado e intervalo inclusivo de datas de criação, na zona America/Sao_Paulo. Não utiliza data da venda, coleta ou faturamento como filtro.
- A API também aplica o escopo do vendedor por ID. Clientes homônimos nunca são unidos pelo nome. Clientes inativos com histórico permanecem consultáveis.
- Inclui fretes operacionais e vendas comerciais FROTA sem frete vinculado. Um espelho comercial vinculado é representado apenas pelo frete operacional, cuja criação, situação e baixa são a referência.
- Recebimento é o valor recebido: na operação, uma baixa PAGO corresponde ao valor integral; na venda comercial, usa pagamentos CONFIRMADO menos ESTORNO, sem depender de dinheiro/PIX/transferência. Pendentes e cancelados não entram.
- Pago vem da baixa da operação ou da apuração financeira existente da venda comercial; valores parciais são identificados. Crédito excedente em uma venda não quita outra automaticamente.
- Todas as datas de recebimento registradas são listadas. Data de saída usa a coleta registrada na operação, explicitamente identificada como coleta. Não há campo de saída na venda comercial sem operação: nesse caso é exibido Não informada. Nenhuma data é inventada.
- A consulta limita a 2.000 vendas e pede redução do período se ultrapassado, sem apresentar totais truncados.
- O PDF da relação segue o exemplar aprovado em A4 paisagem: Data (criação), Motorista, Cliente, Veículo, Placa, Situação (Entrega/Retira/Embarque), Cliente / observação, Valor serviço e Confirmação do pagamento. Inclui marca, cliente, período, totais e saldo. Não exporta custos, comissões, margem, usuário ou credenciais. O mesmo modelo agora é a OS individual aberta dentro da venda/frete FROTA, com número da OS; as OS da Cegonha e versões históricas preservam o modelo anterior.
- Antes do PDF, a pessoa escolhe incluir observações (Sim/Não). A lista exibe cada venda e seu texto existente; é possível selecionar e ajustar o texto só para o documento. Essa escolha não altera vendas, notas originais ou totais.
- Situação do serviço (Entrega/Retira/Embarque) é salva na configuração da venda/frete, separada do status operacional. Na preparação do PDF só há a escolha das observações. A relação e a OS individual puxam a situação salva; valores antigos nulos aparecem como Não informada, sem conversão automática. Para operações vinculadas, o frete é a referência e a edição na venda vinculada atualiza esse campo na operação na mesma transação.
- As OS individuais novas guardam um retrato imutável dos campos do cliente, situação e pagamentos confirmados. Alterações nesses dados pedem Atualizar OS; versões emitidas não são reescritas. A prévia, impressão e download usam a mesma opção de incluir observações. Custos internos não são exportados.
- A migração 017 acrescenta service_situation nullable com CHECK nas duas tabelas, sem transformar status antigos. A reversão do código pode manter as colunas aditivas; não remover colunas enquanto o código novo estiver em uso.
- Novo frete aparece apenas na aba Fretes da Frota. Como é calculado abre modal com botão Fechar, fechamento padrão e a explicação existente.
- O servidor recarrega os dados autorizados e recalcula os totais na exportação. IDs e observações alheios ao relatório são recusados. JSON limitado a 1 MB; cada observação, a 6.000 caracteres. Respostas privadas sem cache público.
- Prévia e download usam o mesmo PDF em URL temporária local do navegador, revogada ao fechar. Não salva cópia nem observações do relatório no banco/Storage.
- Na listagem, a seta segue o padrão de Vendas Cegonha e abre as informações completas da venda/frete. A OS abre dentro do fluxo, com prévia inline e ações separadas Visualizar / imprimir e Salvar PDF. O retorno preserva cliente, período e resultados. A consulta do relatório não oferece exclusão; as demais telas e autorizações não mudam.

## Financeiro e resultados

- Financeiro: remove rota e descrição das despesas da linha frontal. Totais e seta de detalhes permanecem; rota, observações e custos detalhados continuam nos detalhes existentes.
- Resultado das operações: explicação na Visão geral da Frota mostra receita dos fretes coletados no mês menos custos operacionais. Inclui comissões, despesas diretas, combustível e pedágios; não inclui rateio/km, fixos mensais ou vendas comerciais sem operação. Faturamento usa outra data-base e não foi modificado.
- Vendas Geral e Financeiro: o aviso de resultado parcial separa vendas com custos pendentes de confirmação dos fretes FROTA com combustível estimado. A mesma separação é usada no PDF gerencial. Cegonha nunca recebe motivo de combustível; pendências reais de custos são mantidas.
- Diagnóstico de produção em 21/10: os dados consultados continham custos não confirmados na Cegonha e combustível estimado na Frota. Não houve alteração ou confirmação automática desses registros. A contagem exibida depende dos filtros e do perfil.

## Exclamação de suporte

- A barra lateral consulta os chats do usuário pela ponte assinada existente a cada 5 segundos enquanto a página está visível. Não exige abrir Suporte e não cria chamado.
- Exclamação vermelha com rótulo acessível quando a última mensagem da equipe ainda não foi lida neste navegador. Respostas próprias não geram aviso. Funciona também no menu recolhido.
- A leitura só é reconhecida com a conversa aberta, documento visível e rolagem próxima ao fim. Poll em segundo plano ou consulta do indicador não marca mensagens como lidas.
- O marcador guarda apenas IDs opacos, separado por usuário/conversa, em localStorage; sincroniza abas do mesmo navegador. Leitura em outro navegador/dispositivo é independente. Se armazenamento estiver bloqueado, usa memória da sessão.
- Não mantém texto das mensagens em storage, não envia credenciais da empresa ao navegador e não altera Sup ou seus bancos. Encerramento remove o aviso na próxima consulta. Erro de transporte preserva um alerta conhecido.

## Validação e reversão

- Testes de domínio: datas, cliente por ID, pagamentos parciais/crédito, escolha de observações, separação de motivos e leitura de mensagens.
- Integração PostgreSQL: autenticação, vendedores, cliente homônimo, criação na virada do dia, dois limites inclusivos, espelho sem duplicidade, exclusão Cegonha, recebimentos/estornos, exportação e observações sem escrita na venda.
- PDF: uma página e documento longo, com renderização visual de páginas de tabela/observações e conferência de texto.
- Lint dos arquivos alterados e build de produção. O lint global da base tem erro anterior em support-workspace.tsx (set-state-in-effect), fora deste diff.
- Sem mudanças de schema ou dados. Reverter o commit do PR restaura a interface e APIs anteriores; marcadores locais de leitura podem permanecer sem efeito.
