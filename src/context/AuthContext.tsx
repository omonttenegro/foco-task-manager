import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setApiAccessToken } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type AuthResult = { error: string | null; needsConfirmation?: boolean };
type ProfileUpdate = { fullName: string };
type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  recoveryMode: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (fullName: string, email: string, password: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  updateProfile: (profile: ProfileUpdate) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  leaveRecovery: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function authMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/invalid login credentials/i.test(message)) return 'Email ou palavra-passe incorretos.';
  if (/email not confirmed/i.test(message)) return 'Confirma primeiro o email que recebeste.';
  if (/user already registered/i.test(message)) return 'Já existe uma conta com este email.';
  if (/password should be/i.test(message)) return 'A palavra-passe deve ter pelo menos 8 caracteres.';
  if (/rate limit/i.test(message)) return 'Foram feitas demasiadas tentativas. Espera um pouco e volta a tentar.';
  return message || 'Não foi possível concluir a autenticação.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!supabase) { setApiAccessToken(null); setLoading(false); return; }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setApiAccessToken(data.session?.access_token ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setApiAccessToken(nextSession?.access_token ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'A ligação ao Supabase ainda não está configurada.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ? authMessage(error) : null };
  }, []);

  const signUp = useCallback(async (fullName: string, email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'A ligação ao Supabase ainda não está configurada.' };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName.trim() },
      },
    });
    return { error: error ? authMessage(error) : null, needsConfirmation: !error && !data.session };
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'A ligação ao Supabase ainda não está configurada.' };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    return { error: error ? authMessage(error) : null };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'A ligação ao Supabase ainda não está configurada.' };
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setRecoveryMode(false);
    return { error: error ? authMessage(error) : null };
  }, []);

  const updateProfile = useCallback(async ({ fullName }: ProfileUpdate): Promise<AuthResult> => {
    if (!supabase) return { error: 'A ligação ao Supabase ainda não está configurada.' };
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
    return { error: error ? authMessage(error) : null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setApiAccessToken(null);
    setRecoveryMode(false);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    loading,
    recoveryMode,
    session,
    user: session?.user ?? null,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    updateProfile,
    signOut,
    leaveRecovery: () => setRecoveryMode(false),
  }), [loading, recoveryMode, session, signIn, signOut, signUp, requestPasswordReset, updatePassword, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  return context;
}

