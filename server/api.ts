import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Store } from './store';
import { AppError } from './errors';
import { authenticatedUserId } from './auth';

export function json(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > 25_000_000) {
        reject(new AppError('Pedido demasiado grande.', 413));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new AppError('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, store: Store) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true });
  if (!pathname.startsWith('/api/')) return false;
  try {
    await authenticatedUserId(req.headers.authorization);
    const body = ['POST', 'PATCH', 'PUT'].includes(req.method ?? '') ? await readBody(req) : {};
    if (pathname === '/api/state' && req.method === 'GET') return json(res, 200, store.list());
    if (pathname === '/api/export' && req.method === 'GET') return json(res, 200, store.export());
    if (pathname === '/api/import' && req.method === 'POST') return json(res, 200, store.import(body));
    if (pathname === '/api/settings' && req.method === 'PATCH') return json(res, 200, store.settings(body));

    const match = pathname.match(/^\/api\/(categories|projects|tasks|dependencies|sessions)(?:\/([\da-f-]+))?(?:\/(duplicate|reorder))?$/i);
    if (!match) throw new AppError('Rota não encontrada.', 404);
    const [, resource, id, action] = match;
    if (resource === 'tasks' && id && action === 'duplicate' && req.method === 'POST') return json(res, 200, store.duplicateTask(id));
    if (resource === 'tasks' && id && action === 'reorder' && req.method === 'POST') return json(res, 200, store.reorderTask(id, Number(body.direction) as -1 | 1));
    if (action) throw new AppError('Operação inválida.', 405);

    if (req.method === 'POST' && !id) {
      if (resource === 'categories') return json(res, 200, store.category(body));
      if (resource === 'projects') return json(res, 200, store.project(body));
      if (resource === 'tasks') return json(res, 200, store.task(body));
      if (resource === 'dependencies') return json(res, 200, store.dependency(body));
      if (resource === 'sessions') return json(res, 200, store.session(body));
    }
    if (req.method === 'PATCH' && id) {
      if (resource === 'categories') return json(res, 200, store.category(body, id));
      if (resource === 'projects') return json(res, 200, store.project(body, id));
      if (resource === 'tasks') return json(res, 200, store.task(body, id));
      if (resource === 'sessions') return json(res, 200, store.session(body, id));
    }
    if (req.method === 'DELETE' && id) {
      const table = {
        categories: 'categories', projects: 'projects', tasks: 'tasks',
        dependencies: 'task_dependencies', sessions: 'planned_sessions'
      } as const;
      return json(res, 200, store.remove(table[resource as keyof typeof table], id));
    }
    throw new AppError('Operação não suportada.', 405);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    const message = error instanceof AppError ? error.message : 'Erro interno do servidor.';
    if (process.env.NODE_ENV === 'development' && !(error instanceof AppError)) console.error(error);
    json(res, status, { error: message });
    return true;
  }
}
