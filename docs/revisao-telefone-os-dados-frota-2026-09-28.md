# Telefone da OS, dados financeiros e exclusão de placas

## Alterações

- Cadastro e edição de usuários usam Telefone no lugar de E-mail. O identificador interno e as credenciais existentes são preservados; telefones em branco permanecem sem informação.
- Novas versões da OS usam o telefone cadastrado do usuário que emite o documento, tanto nas vendas quanto na Frota. O telefone fixo do timbrado é substituído apenas nas novas versões; versões antigas permanecem intactas.
- A aba Vendas foi retirada da Frota. Registros comerciais existentes continuam acessíveis em Vendas, pelo seletor Cegonha/Frota, com as mesmas permissões.
- Faturamento inclui fretes sem data de faturamento provisoriamente pelo mês da coleta e identifica a pendência. A data de faturamento, quando informada, tem prioridade. Nenhuma data antiga é preenchida automaticamente no banco.
- Fechamento mensal consolida Vendas/Fretes sem vínculo operacional e Frota. Uma venda vinculada a um frete da Frota não duplica a operação. Receitas, comissões e custos de vendas passam a fazer parte da apuração. Fechamentos anteriores não são recalculados.
- O fechamento final exige resolver pendências de faturamento, combustível realizado e custos de vendas. Lançamentos manuais geram lembrete de conferência para evitar duplicação.
- Exclusão de placas remove o cadastro e preserva fretes, viagens, custos mensais, placa histórica e auditoria. Exclusões continuam sujeitas à confirmação e aos perfis existentes.

## Migração

`supabase/migrations/20260928224007_user_phone_vehicle_deletion.sql` está integrada ao executor de migrações do projeto. Adiciona telefone aos usuários e preservação da placa em viagens/histórico; referências ao cadastro excluído passam a ficar nulas. Não executada em produção. Nenhum número de telefone foi inventado ou cadastrado em usuários reais.

## Validação

- 48 testes unitários/PDF e 42 de integração aprovados.
- TypeScript, build de produção, lint dos arquivos alterados e conferência do diff aprovados.
- PostgreSQL local via PGlite: migração reaplicável, exclusão com viagem vinculada e preservação dos totais, escopo de acesso, telefone/OS versionada, consolidação acima de 500 vendas, pendências e snapshots de fechamento.
- PDF renderizado e inspecionado: telefone do emissor na posição do contato da empresa, sem sobreposição; dados fictícios.
- Conferência das telas em navegador pendente: Playwright disponível, mas sem executável do Chromium; download retornou arquivo inválido. Não foi possível validar a interação em tela neste ambiente.

Sem merge, deploy ou alteração de dados de produção nesta entrega.
