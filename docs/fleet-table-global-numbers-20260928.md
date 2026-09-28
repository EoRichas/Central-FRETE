# Tabelas da Frota e numeração global completa

Correção sobre o PR #59, conforme as imagens e o esclarecimento do usuário em 28/09/2026.

## Interface

- Restaura a tabela larga da Frota, com rolagem horizontal dentro da tabela. Remove os cartões introduzidos no PR #59 e impede que tabelas e filtros imponham largura excedente à página.
- Mantém essa tabela também em telas pequenas, com acesso às colunas pela rolagem interna.
- Restaura o detalhamento dos custos nas linhas da Frota.
- Troca a seta de edição no cabeçalho dos detalhes de vendas por **Editar frete**, usando o botão da Frota. A seta de acesso aos detalhes na listagem permanece.
- Preserva a ordem das abas, consulta das vendas e histórico mensal entregues anteriormente.

## Numeração

A migração 012 já gerava números compartilhados entre Cegonha e Frota a partir de 201, mas excluía da conversão as vendas com OS emitida. A nova migração **014_complete_global_sale_numbers.sql** converte esses registros e os demais identificadores legados automaticamente.

- Mantém os números globais já atribuídos, a partir de 201, e o maior contador registrado. Não reutiliza números de vendas excluídas.
- Converte os restantes pela ordem data da venda, criação e ID, usando os próximos números disponíveis, independentemente do canal.
- Não reinicia a sequência no ano seguinte. Exemplo em base nova: Frota 201, Cegonha 202, Frota 203.
- Impede número manual em INSERT e alteração em UPDATE no banco. Formulário e APIs já bloqueiam a edição.
- Importações também recebem número automático; a referência original fica nas observações e os dados de origem permanecem vinculados.
- Registra cada mudança em audit_logs, com números anterior e novo e canal. Não altera IDs, custos, recebimentos ou vínculos.
- Preserva integralmente as versões de OS já emitidas. O sistema indica que os dados mudaram; uma nova versão usa o novo número, mantendo a antiga disponível.

## Migração e operação

A migração foi adicionada ao runner existente e será aplicada uma vez na próxima inicialização pelo fluxo de implantação. Não foi executada em produção nesta entrega.

Antes de implantar, guardar backup do banco e conferir os identificadores a converter:

```sql
SELECT id, sale_number, sale_channel, sale_date
FROM public.freight_sales
WHERE NOT CASE WHEN sale_number ~ '^[1-9][0-9]*$'
  THEN sale_number::numeric >= 201 ELSE false END
ORDER BY sale_date, created_at, id;
```

A migração é transacional, auditada e repetível. Usa bloqueio da tabela durante a conversão e timeout de 10 segundos para aquisição dos bloqueios. Se ocorrer falha antes do COMMIT, todas as mudanças, inclusive contador e trigger, são revertidas juntas. Validado por falha deliberada na gravação da auditoria.

Após o COMMIT, rollback de código não desfaz a numeração. Os números anteriores podem ser consultados na auditoria com `actor_email='migration:014'`. Não reexecutar migrations antigas nem reverter números manualmente: uma reversão de dados exige plano específico, conferência de documentos emitidos após a mudança e backup.

## Validação

Testes cobrem base nova com sequência cruzada 201/202/203, atualização de todos os legados, vendas com OS, auditoria, rollback por falha, repetição da migração, bloqueio de números manuais, preservação de custos/recebimentos e importação sem reutilizar a referência da planilha como número.

47 testes gerais e 37 testes de integração aprovados. TypeScript e build aprovados. Lint sem erros, com seis avisos preexistentes em outros componentes.

Nenhuma permissão foi ampliada. Conferência visual no ambiente publicado permanece pendente porque não há navegador local disponível nesta execução.

## Complemento: OS atual sem seletor

Por solicitação posterior, a tela da OS não oferece seleção nem exibe número de versão. Visualização, impressão e download consultam a emissão mais recente; após atualização, a prévia é recarregada. O botão passa a usar o texto Atualizar OS. O PDF do modelo atual e o nome do arquivo também não mostram versão. O histórico interno e o acesso autenticado aos documentos antigos permanecem preservados.

Validação deste complemento: três testes de OS/PDF e 37 de integração aprovados, TypeScript, lint dos arquivos alterados e build aprovados. PDF de demonstração renderizado e inspecionado visualmente, sem indicação de versão.
