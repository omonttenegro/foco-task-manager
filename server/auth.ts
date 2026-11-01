import { createClient } from '@supabase/supabase-js';
import { AppError } from './errors';

let client: ReturnType<typeof createClient> | null = null;

function authClient() {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)?.trim();
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();
  if (!url || !key) throw new AppError('A autenticação ainda não está configurada no servidor.', 503);
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}

export function bearerToken(header: string | null | undefined) {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticatedUserId(authorization: string | null | undefined) {
  const token = bearerToken(authorization);
  if (!token) throw new AppError('Inicia sessão para continuares.', 401);
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user) throw new AppError('A tua sessão expirou. Volta a iniciar sessão.', 401);
  return data.user.id;
}

