import { describe, expect, it } from 'vitest';
import { bearerToken } from '../server/auth';

describe('autenticação da API', () => {
  it('extrai um token Bearer válido', () => {
    expect(bearerToken('Bearer token-seguro')).toBe('token-seguro');
    expect(bearerToken('bearer outro-token')).toBe('outro-token');
  });

  it('rejeita cabeçalhos sem o formato Bearer', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer   ')).toBeNull();
  });
});
