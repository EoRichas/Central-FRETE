# Faturamento e cadastros por canal

## Regras entregues

Frota > Faturamento inclui somente fretes com data de faturamento ou status FATURADO. A data de faturamento determina a competência. Registros antigos com status FATURADO sem data usam a coleta, com aviso explícito para corrigir a competência. ENTREGUE ou PAGO, isoladamente, não comprovam faturamento.

Vendas FROTA sem operação vinculada passam a ter data de faturamento no cadastro/edição. Sem essa data, não entram na aba. A forma de pagamento FATURADO não é usada como comprovação de faturamento. Vendas vinculadas continuam representadas somente pelo frete. Totais, quantidade e comissão de motoristas usam os mesmos registros da tabela. A visão operacional e o fechamento mensal conservam as regras atuais; este pedido muda a aba Faturamento.

Clientes recebem classificação Frota, Cegonha ou Ambos, disponível na criação, edição e filtro da lista. Na lista geral o filtro é exato; nos seletores de venda, Frota e Cegonha incluem seus respectivos clientes mais Ambos, sempre ativos. A API impede nova associação incompatível. Vendas históricas podem manter seu cliente mesmo depois de inativação/reclassificação. Não há alteração retroativa nos vínculos.

Os campos de situação de veículos e motoristas passaram de checkbox para seleção Ativo/Inativo. Clientes e prestadores usam a mesma apresentação. O novo prestador também permite selecionar sua situação já na criação.

Motoristas têm formulário amplo com dados pessoais, CPF, telefone, WhatsApp, e-mail, observações e endereço estruturado. Clientes, novos endereços de clientes, motoristas e prestadores compartilham campos CEP, logradouro, número, complemento, bairro, cidade e UF. O CEP usa ViaCEP, permite preenchimento manual e descarta respostas antigas após edição; timeout de 8 segundos. Endereços de vendas, fretes e usuários não foram reformulados.

## Referências de interface

| Decisão | Referência | Aplicação |
| --- | --- | --- |
| Campos e grade | Cadastro de cliente existente | Reutilizar Field, Modal amplo, form-grid e divisores |
| Ativo/Inativo | Pedido e imagem do checkbox | Select nativo com rótulo Situação |
| Canal | Regra solicitada | Frota, Cegonha e Ambos; indicação na lista |
| CEP | Fluxo existente dos clientes | Componente único com erro, consulta e edição manual |

Sem nova identidade visual, cores ou dependências de frontend.

## Banco e compatibilidade

Migração `supabase/migrations/20260929161711_registry_channels_addresses.sql`, criada pelo CLI e incluída no runner de `npm run migrate`.

- Clientes antigos ficam AMBOS. Classificação posterior é manual; não inferida das vendas.
- Endereços antigos permanecem nos campos de texto. O novo JSON começa nulo e só é preenchido ao informar os campos estruturados.
- CPF, vínculos, números de venda, endereços históricos e snapshots não são renumerados nem apagados.
- Data de faturamento comercial começa nula. Não foi inventada uma data para vendas antigas.
- Migração expansiva e repetível, sem alterações de permissões/RLS. Aplicação antes de subir o código, com backup usual do banco. O startup atual também executa o runner.
- Rollback de código pode manter as colunas adicionais; não remover colunas com dados novos. Não foi aplicada migração de produção nesta entrega.

## Validação e limites

49 testes de integração PGlite e 48 testes de domínio/PDF aprovados. Cobertura inclui consulta por competência, status FATURADO, pagamento sem faturamento, mais de 500 registros, novo campo de data, canais/permissões, vínculo histórico, endereços estruturados, dados antigos e situação cadastral. Migrações executadas duas vezes no banco local.

Build e TypeScript verificados. Lint sem erros, com seis avisos anteriores. A interação e o aspecto final no navegador dependem da conferência no preview: a instalação de Chromium falhou no ambiente. O preenchimento externo ViaCEP não foi validado contra o serviço real durante os testes.
