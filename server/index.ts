import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database';
import { Store } from './store';
import { handleApi, json } from './api';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'dist');
const databasePath = process.env.DB_PATH || path.join(root, 'data', 'foco.sqlite');
const port = Number(process.env.PORT || 4188);
const host = process.env.HOST || '127.0.0.1';
const store = new Store(openDatabase(databasePath));
const supabaseOrigin = (() => { try { return new URL(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').origin; } catch { return ''; } })();
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
    if ((req.url ?? '').startsWith('/api/')) {
      await handleApi(req, res, store);
      return;
    }
  if (!['GET', 'HEAD'].includes(req.method ?? '')) return json(res, 405, { error: 'Método inválido.' });
  const url = new URL(req.url ?? '/', 'http://localhost');
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  let file = path.resolve(publicDir, `.${requested}`);
  if (!file.startsWith(`${publicDir}${path.sep}`)) return json(res, 404, { error: 'Ficheiro não encontrado.' });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(publicDir, 'index.html');
  if (!fs.existsSync(file)) return json(res, 503, { error: 'A aplicação ainda não foi compilada. Executa npm run build.' });
  res.writeHead(200, {
    'Content-Type': contentTypes[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ${supabaseOrigin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`
  });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
});

server.on('error', (error) => {
  console.error('Não foi possível iniciar o servidor:', error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Foco disponível em http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
  console.log(`Base de dados: ${databasePath}`);
  if (host === '0.0.0.0') console.warn('Acesso de rede local ativo. Não exponhas esta versão à Internet sem autenticação.');
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
