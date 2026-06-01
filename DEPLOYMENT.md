# Publicacao no GitHub e Vercel

## Estado atual

O sistema hoje roda localmente com um servidor Node (`src/study-server.mjs`) e um banco SQLite local (`questoes-prf.sqlite`).

Isso funciona bem no computador, mas nao deve ser publicado assim no Vercel:

- o SQLite esta no `.gitignore`, entao nao sera enviado ao GitHub por acidente;
- o banco tem centenas de MB e dados de estudo;
- o Vercel Functions tem filesystem de runtime somente leitura, com escrita temporaria apenas em `/tmp`;
- logo, um SQLite local nao serve como banco persistente de producao no Vercel.

## GitHub

1. Crie um repositorio novo no GitHub, preferencialmente privado.
2. Confirme que o `.gitignore` continua bloqueando:
   - `*.sqlite`
   - `*.sqlite-shm`
   - `*.sqlite-wal`
   - `assets/`
   - `pdfs/`
   - `config.local.json`
3. Antes de enviar, verifique se o Git ainda rastreia banco, backups, logs ou imagens geradas:

```powershell
git ls-files "*.sqlite*" "*.log" "*.zip" "study-*.png" "data/*" "exports/*"
```

Se aparecerem arquivos nessa lista, nao faca push ainda. O jeito mais limpo, caso o repositorio nunca tenha sido publicado, e criar uma branch sem historico:

```powershell
git checkout --orphan public-main
git rm -r --cached .
git add .
git commit -m "Publica sistema de estudos PRF"
git branch -M main
```

O `git add .` acima respeita o `.gitignore`, entao o banco local e os gerados nao entram no novo historico.

4. Configure o remoto e envie:

```powershell
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git
git push -u origin main
```

Se o remoto ja existir:

```powershell
git remote set-url origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git
git push -u origin main
```

## Vercel

1. Entre em https://vercel.com.
2. Clique em `New Project`.
3. Importe o repositorio do GitHub.
4. Configure as variaveis de ambiente do banco remoto.
5. Faca o deploy.

Observacao importante: antes do deploy funcionar completo, o backend precisa ser adaptado para Vercel Functions ou para um framework suportado, como Next.js. O servidor atual e um servidor HTTP persistente, bom para `npm run dev`, mas nao e o formato ideal de API serverless do Vercel.

## Banco remoto

Ha duas rotas tecnicas viaveis:

### Opcao A: Turso/libSQL

Mais compativel com o projeto atual, porque continua no mundo SQLite.

Passos gerais:

1. Criar banco Turso/libSQL e copiar a URL/token para o Vercel.
2. Instalar cliente:

```powershell
npm install @libsql/client
```

3. Configurar variaveis no Vercel:

```text
TURSO_DATABASE_URL=...
TURSO_AUTH_TOKEN=...
```

4. Criar um adaptador de banco no codigo para trocar `node:sqlite` por `@libsql/client` quando estiver em producao.
5. Exportar o SQLite local para SQL e importar no Turso.

Essa e a opcao que tende a preservar mais SQL existente, mas ainda exige adaptar chamadas sincronas para chamadas assincronas.

### Opcao B: Postgres, por Neon ou Supabase

Mais padrao para Vercel, mas exige mais conversao.

Passos gerais:

1. Criar banco Neon ou Supabase pelo Vercel Marketplace.
2. Instalar cliente Postgres:

```powershell
npm install postgres
```

3. Configurar `DATABASE_URL` no Vercel.
4. Converter schema SQLite para Postgres.
5. Exportar dados do SQLite para CSV/JSON.
6. Importar no Postgres.
7. Trocar as consultas do backend para Postgres.

Essa opcao e robusta, mas a migracao e maior porque varias queries usam detalhes de SQLite.

Scripts adicionados para a migracao de dados:

```powershell
npm run pg:export

$env:DATABASE_URL="postgres://USUARIO:SENHA@HOST:PORTA/BANCO?sslmode=require"
npm run pg:import
```

Para a importacao inicial, prefira a URL sem pooler do Neon (`DATABASE_URL_UNPOOLED`), porque ela usa uma conexao direta durante a carga grande de dados. Para o app no Vercel, use a `DATABASE_URL` normal/pooler.

O comando `pg:export` abre `questoes-prf.sqlite` em modo somente leitura e gera:

- `postgres-export/schema.sql`
- `postgres-export/indexes.sql`
- `postgres-export/manifest.json`
- `postgres-export/tables/*.jsonl`

O comando `pg:import` escreve somente no Postgres indicado por `DATABASE_URL`. Ele usa `--reset`, ou seja, apaga e recria no banco remoto as tabelas listadas no manifesto. Nao rode esse comando apontando para um banco Postgres que tenha dados importantes sem backup.

Depois da importacao, o servidor local pode ser testado contra Postgres assim:

```powershell
$env:DATABASE_URL="postgres://USUARIO:SENHA@HOST:PORTA/BANCO?sslmode=require"
npm run study:pg
```

O backend ganhou uma camada de compatibilidade para Postgres. Ela permite testar as rotas atuais sem reescrever toda a aplicacao de uma vez. Para producao serverless no Vercel, o ideal de longo prazo ainda e evoluir essa camada para consultas assincronas nativas.

## Recomendacao pratica

Para publicar rapido mantendo o maximo do sistema atual:

1. Subir codigo no GitHub sem o banco.
2. Migrar banco para Turso/libSQL.
3. Adaptar o backend para usar um adaptador de banco.
4. Transformar as rotas atuais em API compativel com Vercel.
5. So depois conectar o projeto no Vercel.

Se a prioridade for colocar online com o minimo de alteracao, uma hospedagem com servidor Node persistente e volume, como Railway, Render ou Fly.io, seria mais simples que Vercel. Mas se a meta for Vercel, a migracao de banco e API e o caminho correto.
