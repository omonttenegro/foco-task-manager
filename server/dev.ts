import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { openDatabase } from './database';
import { Store } from './store';
import { handleApi } from './api';

process.env.NODE_ENV = 'development';
const root = path.resolve(import.meta.dirname, '..');
const databasePath = process.env.DB_PATH || path.join(root, 'data', 'foco.sqlite');
const port = Number(process.env.PORT || 4188);
const host = process.env.HOST || '127.0.0.1';
const store = new Store(openDatabase(databasePath));
const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'spa' });
const server = http.createServer(async (req, res) => {
    if ((req.url ?? '').startsWith('/api/')) {
      await handleApi(req, res, store);
      return;
    }
  vite.middlewares(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
});
server.listen(port, host, () => console.log(`Foco (desenvolvimento): http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(async () => { await vite.close(); store.close(); process.exit(0); }));
