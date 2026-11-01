import { getDatabase } from '@netlify/database';
import type { Config } from '@netlify/functions';
import type { AppState } from '../../shared/types';
import { AppError } from '../../server/errors';
import { authenticatedUserId } from '../../server/auth';
import { emptyState, StateStore } from '../../server/state-store';

const MAX_BODY_BYTES = 25_000_000;

function response(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function storedState(value: unknown): AppState {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object') throw new Error('Estado persistido inválido.');
  return parsed as AppState;
}

async function readBody(request: Request) {
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_BODY_BYTES) throw new AppError('Pedido demasiado grande.', 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new AppError('Pedido demasiado grande.', 413);
  try { return raw ? JSON.parse(raw) as Record<string, unknown> : {}; }
  catch { throw new AppError('JSON inválido.'); }
}

type Database = ReturnType<typeof getDatabase>;
type DatabaseClient = Awaited<ReturnType<Database['pool']['connect']>>;

async function ensureUserState(client: DatabaseClient, userId: string) {
  let selected = await client.query<{ data: AppState | string }>('SELECT data FROM foco_state WHERE id = $1 FOR UPDATE', [userId]);
  if (selected.rows[0]) return selected.rows[0].data;

  const legacy = await client.query<{ data: AppState | string }>('SELECT data FROM foco_state WHERE id = $1 FOR UPDATE', ['default']);
  if (legacy.rows[0]) {
    await client.query('UPDATE foco_state SET id = $1, updated_at = NOW() WHERE id = $2', [userId, 'default']);
    return legacy.rows[0].data;
  }

  const initial = JSON.stringify(emptyState());
  selected = await client.query<{ data: AppState | string }>(
    'INSERT INTO foco_state (id, data) VALUES ($1, $2::jsonb) RETURNING data',
    [userId, initial]
  );
  if (!selected.rows[0]) throw new Error('Não foi possível inicializar o espaço do utilizador.');
  return selected.rows[0].data;
}

async function loadStore(userId: string) {
  const database = getDatabase();
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    const data = await ensureUserState(client, userId);
    await client.query('COMMIT');
    return new StateStore(storedState(data));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function mutateState<T>(userId: string, operation: (store: StateStore) => T): Promise<T> {
  const database = getDatabase();
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    const data = await ensureUserState(client, userId);
    const store = new StateStore(storedState(data));
    const result = operation(store);
    await client.query(
      'UPDATE foco_state SET data = $1::jsonb, version = version + 1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(store.list()), userId]
    );
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const method = request.method.toUpperCase();

  if (pathname === '/api/health' && method === 'GET') return response({ ok: true });
  if (!pathname.startsWith('/api/')) return response({ error: 'Rota não encontrada.' }, 404);

  try {
    const userId = await authenticatedUserId(request.headers.get('authorization'));
    if (pathname === '/api/state' && method === 'GET') return response((await loadStore(userId)).list());
    if (pathname === '/api/export' && method === 'GET') return response((await loadStore(userId)).export());

    const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await readBody(request) : {};
    if (pathname === '/api/import' && method === 'POST') return response(await mutateState(userId, (store) => store.import(body)));
    if (pathname === '/api/settings' && method === 'PATCH') return response(await mutateState(userId, (store) => store.settings(body)));

    const match = pathname.match(/^\/api\/(categories|projects|tasks|dependencies|sessions)(?:\/([\da-f-]+))?(?:\/(duplicate|reorder))?$/i);
    if (!match) throw new AppError('Rota não encontrada.', 404);
    const [, resource, id, action] = match;

    const result = await mutateState(userId, (store) => {
      if (resource === 'tasks' && id && action === 'duplicate' && method === 'POST') return store.duplicateTask(id);
      if (resource === 'tasks' && id && action === 'reorder' && method === 'POST') return store.reorderTask(id, Number(body.direction) as -1 | 1);
      if (action) throw new AppError('Operação inválida.', 405);

      if (method === 'POST' && !id) {
        if (resource === 'categories') return store.category(body);
        if (resource === 'projects') return store.project(body);
        if (resource === 'tasks') return store.task(body);
        if (resource === 'dependencies') return store.dependency(body);
        if (resource === 'sessions') return store.session(body);
      }
      if (method === 'PATCH' && id) {
        if (resource === 'categories') return store.category(body, id);
        if (resource === 'projects') return store.project(body, id);
        if (resource === 'tasks') return store.task(body, id);
        if (resource === 'sessions') return store.session(body, id);
      }
      if (method === 'DELETE' && id) {
        const table = {
          categories: 'categories',
          projects: 'projects',
          tasks: 'tasks',
          dependencies: 'task_dependencies',
          sessions: 'planned_sessions'
        } as const;
        return store.remove(table[resource as keyof typeof table], id);
      }
      throw new AppError('Operação não suportada.', 405);
    });
    return response(result);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    const message = error instanceof AppError ? error.message : 'Erro interno do servidor.';
    if (!(error instanceof AppError)) console.error(error);
    return response({ error: message }, status);
  }
}

export const config: Config = {
  path: '/api/*'
};
