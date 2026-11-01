import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthPage } from './components/AuthPage';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import './styles.css';

function Root() {
  const { configured, loading, recoveryMode, user } = useAuth();
  if (loading) return <div className="app-state auth-loading"><div className="loader" /><strong>A abrir o teu espaço…</strong></div>;
  if (!configured) return <div className="app-state error-state"><h1>Falta ligar o Supabase</h1><p>Adiciona VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY às variáveis da aplicação.</p></div>;
  if (!user || recoveryMode) return <AuthPage initialMode={recoveryMode ? 'recovery' : 'signin'} />;
  return <AppProvider><App /></AppProvider>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><AuthProvider><Root /></AuthProvider></StrictMode>
);
