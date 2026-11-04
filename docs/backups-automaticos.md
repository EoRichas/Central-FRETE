# Backup automático da Central

## Rotina preparada

O workflow `.github/workflows/backup.yml` executa diariamente às 03:17 de São Paulo
(06:17 UTC) e aceita execução manual em Actions. Não depende do site estar ativo
na Hostinger. As cópias ficam em artifacts do GitHub por **14 dias**, criptografadas
com uma chave pública age. O agendamento pode atrasar e exige GitHub Actions ativo,
cota disponível e o workflow na branch padrão.

São copiados:

- Schema `public` com estrutura e dados da Central, incluindo usuários da aplicação,
  histórico e financeiro, usando snapshot consistente do `pg_dump`.
- Conteúdo completo do bucket privado `central-frete` (ou `SUPABASE_STORAGE_BUCKET`),
  com os caminhos originais, tipo de conteúdo e hash SHA-256 por objeto no inventário
  criptografado.

Não é um backup completo da infraestrutura Supabase: não inclui Supabase Auth,
Edge Functions, secrets, outros buckets, configurações do projeto nem papéis globais.
A Central usa usuários no schema public. O código está versionado no GitHub.
Guarde também uma cópia segura das variáveis de produção fora do repositório.

O backup NÃO exclui nem atualiza registros de produção. Só é publicado se banco,
Storage e criptografia concluírem. Mudança de objetos durante a cópia gera falha;
o operador pode repetir a execução. Banco e Storage não compartilham transação:
a cópia não é atomicamente consistente entre esses dois serviços. Evite excluir
ou substituir anexos durante a execução; faça um backup manual em janela sem
escritas antes de migrações/restaurações importantes.

## Ativação única, depois do merge

1. Em um computador seguro, instale `age` e gere a chave:
   ```sh
   age-keygen -o central-backup.key
   age-keygen -y central-backup.key
   ```
   Guarde `central-backup.key` em duas cópias seguras fora do GitHub e da Hostinger.
   Ela é necessária para recuperar os backups. Não enviar a chave privada ao chat,
   não adicioná-la aos secrets e não versioná-la. O comando `-y` imprime só a chave
   **pública**, iniciada por `age1`.

2. No repositório → Settings → Secrets and variables → Actions → Secrets, cadastre:

   | Secret | Valor |
   | --- | --- |
   | `BACKUP_DATABASE_URL` | Conexão Supabase Session Pooler (5432), com leitura de todas as tabelas public e sem restrição por RLS. Use conta de backup dedicada; a credencial limitada do runtime pode não ter essa leitura. |
   | `SUPABASE_URL` | Mesma URL de produção. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Credencial de servidor usada pelo Storage. |
   | `BACKUP_AGE_RECIPIENT` | Chave pública `age1...` obtida acima. |
   | `BACKUP_DATABASE_SSL_CA` | Opcional: PEM do certificado CA obtido no painel Supabase, caso o certificado não seja aceito pelo sistema. |

   A conexão exige TLS com validação de certificado e hostname. Nunca resolver
   erro TLS desabilitando a validação. Não usar Transaction Pooler (6543).
   Não usar a chave service_role como senha do PostgreSQL.

3. Em Actions → **Backup criptografado da Central** → Run workflow, execute uma
   primeira cópia manual. Verifique o resultado e baixe o artifact; ele contém
   uma pasta com `database.dump.age`, `storage.tar.gz.age` e `complete.json`.
   Se faltar acesso ao banco/Storage, a execução falha sem publicar cópia parcial.
   Ative notificações de falha de Actions nas preferências da sua conta GitHub.

4. Valide a descriptografia e a integridade no computador seguro com Python 3.10+,
   age e pg_restore 17 instalados:
   ```sh
   python3 scripts/backup/verify_backup.py /caminho/da/pasta-do-backup --identity /local-seguro/central-backup.key
   ```
   Esse comando **não restaura nem altera banco algum**. Verifica hashes,
   descriptografa o dump para ler seu catálogo e confere os anexos contra o inventário.
   Não substitui um teste de restauração completo.

5. Após validar, em Settings → Secrets and variables → Actions → Variables:
   `CENTRAL_BACKUPS_ENABLED=true`.
   Sem essa variável o agendamento é ignorado; a execução manual continua disponível.

O processo não está ativo apenas por existir no código. Exige merge, secrets,
primeira cópia validada e ativação da variável. Não é necessário mudar o .env da
Hostinger. Não há alteração no build/start do site.

## Recuperação em ambiente isolado

Nunca testar uma restauração no banco de produção.

1. Baixe uma cópia anterior válida e execute a verificação acima.
2. Crie um Supabase de homologação compatível, isolado da Central e com roles e
   extensões necessários. A criação desse ambiente pode ter custo; este código
   não provisiona nenhum serviço.
3. Descriptografe o dump em diretório seguro e restaure o schema public no banco
   de homologação vazio com `pg_restore --no-owner --no-privileges --exit-on-error`.
   Não use `--clean` em produção. Reconceda permissões ao usuário de runtime;
   permissões/owners não são transportados pelo dump.
4. Descriptografe `storage.tar.gz.age` em diretório seguro. Os arquivos possuem
   nomes neutros em `objects/`; `manifest.json` relaciona cada arquivo ao caminho
   original do bucket. Reenvie para um bucket **privado** com os caminhos e os
   content types do inventário, usando a API Storage; não basta copiar metadados SQL.
5. Aponte uma instância isolada da aplicação para o banco e o bucket de homologação.
   Teste login, uma venda da Frota, uma venda Cegonha, financeiro, emissão/visualização
   de OS e download de comprovante. Confirme também contagens e valores financeiros.
6. Só após o teste, planeje separadamente uma eventual recuperação de produção.

A chave privada nunca deve ser necessária no job de backup. Faça periodicamente
um teste completo de restauração e mantenha uma cópia validada por mais de 14 dias
em local seguro se precisar de recuperação histórica longa. Os artifacts expiram;
não são armazenamento permanente. O consumo depende das cotas do GitHub e do tráfego
de saída do Supabase. Não foi contratado nenhum plano adicional.

## Verificações locais do código

```sh
python3 -m unittest discover -s tests/backup -v
```

As verificações usam objetos de teste e chaves temporárias. Os testes com age/pg_dump
são ignorados quando essas ferramentas não estão instaladas. Nenhuma cópia real de
dados de clientes é necessária para executar essa suíte.
