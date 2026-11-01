# Foco

Gestor pessoal de tarefas, categorias e planeamento. Pode funcionar localmente com SQLite ou online na Netlify com Netlify Functions e Netlify Database (Postgres).

Produção: [https://foco-to-do-app.netlify.app](https://foco-to-do-app.netlify.app)

## Começar

Requer **Node.js 22.13 ou mais recente**.

No macOS, podes fazer duplo clique em **`Iniciar Foco.command`**. Na primeira abertura, o sistema poderá pedir confirmação por se tratar de um ficheiro local.

Em alternativa, no Terminal:

```bash
cd /Users/andremontenegro/Documents/ToDo_app
npm install
npm run dev
```

Abre [http://127.0.0.1:4188](http://127.0.0.1:4188). Para parar a aplicação, carrega em `Ctrl+C` no Terminal.

## Utilização diária

- `N`: criar uma tarefa a partir de qualquer vista.
- `⌘ K` / `Ctrl K`: focar a pesquisa global.
- `⌘ Shift H` / `Ctrl Shift H`: abrir a Overview.
- `⌘ Shift I` / `Ctrl Shift I`: abrir a Inbox.
- Clica numa tarefa para abrir todos os detalhes no painel lateral.
- Em **Planeamento**, arrasta tarefas para os dias e sessões entre dias.
- No **Calendário**, deadlines aparecem separados das sessões planeadas.

No modo local, os dados ficam em `data/foco.sqlite`. A pasta `data/` é criada automaticamente. Não edites a base de dados enquanto a aplicação estiver aberta.

Para executar o ambiente Netlify completo, incluindo Function e uma base Postgres local:

```bash
npm run dev:netlify
```

## Backups

Abre **Definições → Exportar** para descarregar um backup JSON completo. A opção **Importar** valida o ficheiro e só depois substitui os dados atuais numa transação única.

É aconselhável exportar um backup regularmente e guardá-lo fora desta pasta. O ficheiro SQLite também pode ser copiado, mas apenas com a aplicação parada.

## Verificação e execução otimizada

```bash
npm run check   # TypeScript e testes
npm run build   # gera a aplicação em dist/
npm start       # serve a versão compilada
```

Variáveis opcionais:

```bash
PORT=4190 npm start
DB_PATH=/caminho/absoluto/foco.sqlite npm start
HOST=0.0.0.0 npm start
```

O servidor usa `127.0.0.1` por segurança. Só uses `HOST=0.0.0.0` numa rede em que confies; esta versão é pessoal e não tem autenticação.

## Estrutura

```text
src/       interface React, páginas, componentes e lógica de apresentação
server/    regras de domínio, servidor local e acesso à SQLite
netlify/   função serverless e migração da base Postgres de produção
shared/    tipos partilhados entre frontend e backend
tests/     regras de domínio e persistência
data/      base de dados local (ignorada pelo Git)
dist/      build de produção (gerado)
```

As alterações à estrutura SQLite são aplicadas através de migrações em `server/database.ts`. Em produção, as migrações ficam em `netlify/database/migrations/`. A camada de domínio mantém as mesmas validações nos dois ambientes.

## Publicação na Netlify

A pasta já está associada ao projeto Netlify `foco-to-do-app`. Para publicar alterações:

```bash
npm run check
npm run deploy        # rascunho para validação
npm run deploy:prod   # produção
```

O build usa `netlify.toml`, publica `dist/`, empacota `netlify/functions/api.ts` e aplica automaticamente as migrações em `netlify/database/migrations/`.

Os dados locais e os dados online são independentes. Para levar as tarefas locais para a versão online, exporta um backup em **Definições → Exportar** na app local e importa-o na versão online.

> A URL de produção é pública por defeito. Antes de guardares informação sensível, configura **Project configuration → General → Visitor access → Project visibility** no painel da Netlify. Projetos privados exigem início de sessão na Netlify; proteção por palavra-passe depende do plano.

## Comandos

| Comando | Finalidade |
|---|---|
| `npm run dev` | Desenvolvimento local com atualização automática |
| `npm run dev:netlify` | Ambiente Netlify local com Function e Postgres |
| `npm run build` | Validação TypeScript e build de produção |
| `npm run deploy` | Publicar um rascunho na Netlify |
| `npm run deploy:prod` | Publicar em produção na Netlify |
| `npm start` | Servir o build local |
| `npm test` | Executar os testes uma vez |
| `npm run test:watch` | Testes em modo contínuo |
| `npm run check` | TypeScript + testes |
