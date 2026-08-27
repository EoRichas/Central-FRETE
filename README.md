# Central Frete

Sistema interno para gerenciar vendas de frete, clientes, prestadores, custos,
comissões, recebimentos e comprovantes. O servidor utiliza Next.js 16, React 19,
PostgreSQL e Supabase Storage.

## Projeto Supabase

Crie o projeto `Central-FRETE` na organização `Central` e selecione a região
**South America (São Paulo)**, identificada por **`sa-east-1`**.

As tabelas são criadas automaticamente na primeira inicialização do servidor.
O arquivo `database/001_central_frete_postgres.sql` pode ser executado novamente
sem apagar registros. Todas as tabelas operacionais possuem Row Level Security.

## Variáveis de ambiente

| Variável | Obrigatória | Valor |
| --- | --- | --- |
| `DATABASE_URL` | Sim | URI **Session Pooler** do Supabase, porta `5432`. |
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
o servidor valida o Session Pooler, cria ou atualiza as 16 tabelas, prepara o
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
