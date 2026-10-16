# Central Frete

Sistema interno para gerenciar vendas de frete, clientes, prestadores, custos,
comissões, recebimentos, comprovantes e a operação da frota. O servidor utiliza
Next.js 16, React 19, PostgreSQL e Supabase Storage.

## Projeto Supabase

Crie o projeto `Central-FRETE` na organização `Central` e selecione a região
**South America (São Paulo)**, identificada por **`sa-east-1`**.

As tabelas são criadas automaticamente na primeira inicialização do servidor.
Os arquivos em `database/` podem ser executados novamente sem apagar registros.
Todas as tabelas operacionais possuem Row Level Security.

## Variáveis de ambiente

| Variável | Obrigatória | Valor |
| --- | --- | --- |
| `DATABASE_URL` | Sim | URI do Supabase: **Session Pooler** (`5432`) no Render; **Transaction Pooler** (`6543`) na Vercel. |
| `DATABASE_MIGRATION_URL` | Para migrações com Transaction Pooler | URI **Session Pooler** (`5432`) ou direta, usada apenas pelo comando de migração. |
| `CENTRAL_FRETE_SESSION_SECRET` | Sim | Valor aleatório com pelo menos 32 caracteres. |
| `SUPABASE_URL` | Para anexos | URL pública do projeto, como `https://SEU_PROJECT_REF.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Para anexos | Chave `service_role`, configurada somente no servidor. |
| `SUPABASE_STORAGE_BUCKET` | Não | Nome do bucket privado; padrão: `central-frete`. |
| `PORT` | Não | Porta informada automaticamente pelo Render. |

No Supabase, abra **Connect → Session pooler** e copie a URI completa:

```text
postgresql://postgres.SEU_PROJECT_REF:SENHA@HOST.pooler.supabase.com:5432/postgres
```

Use exatamente o host fornecido pelo Supabase. Se a senha tiver caracteres
especiais, copie a versão codificada da conexão. Não use
`db.SEU_PROJECT_REF.supabase.co:5432` no Render: a conexão direta exige IPv6 e
provoca o erro `ENETUNREACH`.

Para gerar um segredo de sessão:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Não publique a senha do banco ou a chave `service_role` no GitHub.
Planilhas, vendedores, placas e valores operacionais também não são incluídos
no repositório público; cadastre esses dados diretamente no sistema.

## Publicar na Vercel

Use o **Transaction pooler** do Supabase (porta `6543`) para as funções serverless.
Com `VERCEL=1`, o driver também adapta automaticamente uma URI antiga do pooler
compartilhado (`*.pooler.supabase.com:5432`) para a porta `6543`, mantendo host,
credenciais, banco e parâmetros. Conexões diretas e hosts/portas personalizados
não são reescritos.

Cada instância utiliza no máximo três conexões, com timeout ocioso de cinco
segundos e prepared statements desativados. O Transaction Pooler compartilha
conexões do banco sem reservar permanentemente uma vaga por cliente.
Cada operação usa uma transação exclusiva, inclusive leituras: isso impede o
pipelining de consultas independentes do Postgres.js, incompatível com o pooler
compartilhado. Aumentar conexões ou timeouts não corrige essa incompatibilidade.

Como a suspensão da Vercel pode pausar os timers, o servidor também substitui o
cliente após dez segundos sem operações em andamento, antes de voltar a usá-lo.
Consultas e transações têm prazo total de vinte segundos; um cliente travado é
descartado, sem repetir automaticamente gravações. As leituras no navegador têm
prazo de 25 segundos, incluindo o recebimento do corpo da resposta. Se uma
gravação falhar por timeout, confira os dados antes de repeti-la.

A adaptação ocorre somente no driver da aplicação. O comando `npm run migrate`
continua usando `DATABASE_MIGRATION_URL` (ou `DATABASE_URL` quando ela ainda aponta
para Session Pooler). Migrações usam locks de sessão e não devem usar Transaction
Pooler. Referência: [conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Publicar no Render

Conecte o repositório `EoRichas/Central-FRETE`, branch `main`. Como a aplicação
está na raiz do repositório, deixe **Root Directory vazio**.

O arquivo `render.yaml` configura o serviço automaticamente. Na criação manual,
informe:

```text
Build Command: npm ci --include=dev && npm run build
Start Command: npm start
Health Check Path: /api/health
```

Configure as variáveis de ambiente antes do primeiro deploy. Na inicialização,
o servidor valida o Session Pooler, cria ou atualiza as 20 tabelas, prepara o
bucket privado de comprovantes e inicia o Next.js na porta do Render.

## Primeiro acesso

Abra `/login`. Quando não existir nenhum usuário, o sistema encaminha para
`/configurar-admin`. Informe nome, usuário, senha e confirmação. Esse usuário
recebe o perfil `ADMIN`; não existe administrador padrão nem senha global.

As senhas são armazenadas como hash PBKDF2 com salt individual. A variável
`CENTRAL_FRETE_PASSWORD` não é utilizada. Depois do primeiro cadastro, o ADMIN
pode cadastrar usuários `ADMIN`, `VENDEDOR` e `FINANCEIRO`. Contas antigas com
o perfil `GERENCIA` continuam funcionando até que o acesso seja atualizado ou
excluído pelo administrador.

## Desenvolvimento

Requisitos: Node.js 22.13 ou superior e npm.

```bash
cp .env.example .env.local
npm ci
npm run migrate
npm run dev
```

Os comandos `npm run migrate` e `npm run dev` leem `.env.local` automaticamente.

Para validar regras financeiras, consultas PostgreSQL, migração e configuração:

```bash
npm test
npm run lint
```

## Acesso ao sistema

O acesso depende da sessão, do usuário ativo e das permissões do perfil. Não há
certificado digital ou bloqueio por mensalidade. A retirada da integração de
cobrança e as verificações externas estão documentadas em
[Retirada do certificado digital](docs/retirada-certificado-digital.md).

## Conta restrita e TLS do banco

A migração `20261016124849_restricted_runtime_role.sql` prepara `central_app`
sem login e sem senha. Ela concede DML apenas nas tabelas do sistema, acesso
somente de leitura/inclusão à auditoria e políticas RLS exclusivas desse papel.
Não concede acesso às tabelas de migração, schemas Auth/Storage, DDL, TRUNCATE,
criação de usuários ou bypass de RLS. Perfis de navegador continuam sem acesso.
A autorização por usuário continua obrigatória nas APIs do servidor.

O provisionamento é uma etapa administrativa separada: testar a migração,
aplicá-la como administrador, definir uma senha aleatória forte fora do Git e
habilitar LOGIN para `central_app`; trocar `DATABASE_URL` na hospedagem pelo
usuário `central_app.PROJECT_REF` no mesmo pooler e publicar novamente. A senha
não deve aparecer em chat, logs, commits ou PRs. Até essa troca, o runtime
continua usando a credencial anterior. Não criar um novo usuário do sistema.

Migrações devem usar uma credencial administrativa separada, fora do runtime.
Em servidor persistente, configure `CENTRAL_FRETE_MIGRATE_ON_START=false` e
execute migrações em processo separado. Não colocar a senha administrativa nas
variáveis das funções Vercel. Novas tabelas precisam de concessões explícitas.

A aplicação e o migrador validam cadeia e hostname TLS (`rejectUnauthorized`).
Hosts Supabase usam a CA pública oficial incluída no projeto. Outros provedores
usam as CAs confiáveis do Node. Para rotação ou CA específica, configure o PEM
oficial em `DATABASE_SSL_CA`. Nunca desabilitar a validação para resolver erro
de certificado.

Rollback: voltar à versão anterior apenas para regressão funcional e restaurar
a credencial anterior no gerenciador da hospedagem se a ativação do papel falhar.
As políticas específicas do papel não alteram o acesso da conta antiga. Para
desativar a conta nova, use `ALTER ROLE central_app NOLOGIN`; não remover dados.

O certificado público da autoridade Supabase está incluído em `lib/server/database-tls.mjs`, com origem e fingerprint documentadas, e é utilizado somente nos hosts oficiais de banco/pooler. Não contém chave privada. Hosts de outros provedores continuam usando as autoridades confiáveis do Node. `DATABASE_SSL_CA` permite fornecer uma nova CA quando houver rotação; a validação de certificado e hostname permanece obrigatória.
