/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme } from '../src/lib/theme';

function preferDark(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
}

describe('tema do sistema', () => {
  beforeEach(() => {
    const storedValues = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => storedValues.clear(),
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
        removeItem: (key: string) => storedValues.delete(key),
      },
    });
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-accent');
    document.head.innerHTML = '<meta name="theme-color" content="#f7cfdf">';
  });

  it('acompanha um sistema escuro', () => {
    preferDark(true);
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('acompanha um sistema claro', () => {
    preferDark(false);
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('respeita o modo claro explícito mesmo num sistema escuro', () => {
    preferDark(true);
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('aplica a cor escolhida à aplicação e ao navegador', () => {
    preferDark(false);
    applyTheme('light', 'blue');
    expect(document.documentElement.dataset.accent).toBe('blue');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#dce9f8');
  });

  it('mantém o navegador neutro no modo escuro, independentemente da cor escolhida', () => {
    preferDark(true);
    applyTheme('dark', 'violet');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0c0d10');

    applyTheme('dark', 'emerald');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0c0d10');
  });

  it('recupera a cor guardada quando o servidor ainda não a fornece', () => {
    preferDark(false);
    applyTheme('light', 'emerald');
    document.documentElement.removeAttribute('data-accent');

    applyTheme('light');

    expect(document.documentElement.dataset.accent).toBe('emerald');
  });
});
