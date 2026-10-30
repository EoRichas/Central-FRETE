# Status operacional na Frota

Restaura o seletor em Novo/Editar frete, na seção Operação e valores. A mesma linha contém Situação do serviço, Status operacional e Valor do frete, usando a grade responsiva existente.

Conforme a última imagem enviada, os valores continuam sendo os da Frota: Sem previsão, Coleta agendada, Em rota, No pátio, Aguardando carga, Entregue, Faturado e Coleta frustrada. Inclui também Aguardando embarque. O formato do campo segue a Cegonha; a lista da Cegonha permanece independente.

A edição abre no status salvo e envia o valor selecionado para a API. Um novo frete inicia em Sem previsão. No modo de edição exclusivamente financeira, o seletor fica desabilitado e o payload preserva o status atual. Prioridade continua preservada pelo formulário sem reintroduzir seu campo.

O catálogo compartilhado da Frota alimenta os seletores e filtros de todos os perfis existentes. Status operacional, situação do serviço e situação financeira são dados separados; escolher um status não altera a baixa do pagamento.

## Banco e publicação

A migração 20261030183239_fleet_awaiting_embark_status.sql amplia somente o CHECK de fleet_freights.operational_status para aceitar AGUARDANDO_EMBARQUE. Mantém todos os oito valores existentes e não reclassifica vendas históricas. Foi adicionada ao runner de migrações e pode ser reaplicada.

A validação atual do banco de produção foi consultada em modo de leitura e ainda permite somente os oito valores antigos. A migração deve ser aplicada antes de publicar a interface que permite salvar o novo valor. Em instalações sem migração automática no início, executar npm run migrate com a conexão de migração. Nenhuma migração ou alteração de registro de produção foi executada nesta preparação.

## Validação

- 130 testes de regras/componentes e 113 de integração passaram.
- Regressão do formulário confirma posição, opções, valor inicial salvo e envio do novo valor selecionado.
- Integração cria um frete com Aguardando embarque, grava e relê todos os nove status, preserva Situação do serviço e pagamento, rejeita valores inválidos na API e no banco e reaplica a migração sem modificar o registro.
- TypeScript, lint dos arquivos alterados, build e git diff --check passaram.
- Conferência visual do componente real com dados fictícios confirmou o campo ao lado de Situação do serviço.
