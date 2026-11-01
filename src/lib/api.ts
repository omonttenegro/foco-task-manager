export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

let accessToken: string | null = null;

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      }
    });
  } catch {
    throw new ApiError('Sem ligação ao servidor. Confirma a tua ligação à Internet ou se a aplicação está em execução.', 0);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(result.error || 'Ocorreu um erro inesperado.', response.status);
  return result as T;
}

export const body = (value: unknown) => JSON.stringify(value);
