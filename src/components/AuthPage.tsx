import { ArrowLeft, ArrowRight, Asterisk, Check, Eye, EyeOff, KeyRound, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'recovery';

export function AuthPage({ initialMode }: { initialMode?: AuthMode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode ?? 'signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const effectiveMode = auth.recoveryMode ? 'recovery' : mode;
  const copy = useMemo(() => ({
    signin: { title: 'Bem-vindo de volta', note: 'Continua exatamente onde deixaste tudo.' },
    signup: { title: 'Cria o teu espaço', note: 'Um lugar privado para organizares o que importa.' },
    forgot: { title: 'Recuperar acesso', note: 'Enviamos-te um link seguro para voltares a entrar.' },
    recovery: { title: 'Nova palavra-passe', note: 'Escolhe uma palavra-passe nova para a tua conta.' },
  }[effectiveMode]), [effectiveMode]);

  const changeMode = (next: AuthMode) => { setMode(next); setError(null); setSuccess(null); setPassword(''); setConfirmation(''); };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    try {
      if (effectiveMode === 'signin') {
        const result = await auth.signIn(email, password); setError(result.error);
      } else if (effectiveMode === 'signup') {
        const result = await auth.signUp(fullName, email, password); setError(result.error);
        if (!result.error && result.needsConfirmation) setSuccess('Conta criada. Abre o email que te enviámos para confirmares o acesso.');
      } else if (effectiveMode === 'forgot') {
        const result = await auth.requestPasswordReset(email); setError(result.error);
        if (!result.error) setSuccess('Link enviado. Consulta o teu email para definires uma nova palavra-passe.');
      } else {
        if (password !== confirmation) { setError('As palavras-passe não coincidem.'); return; }
        const result = await auth.updatePassword(password); setError(result.error);
        if (!result.error) { setSuccess('Palavra-passe atualizada.'); window.setTimeout(() => changeMode('signin'), 900); }
      }
    } finally { setBusy(false); }
  };

  return <main className="auth-page">
    <div className="auth-aurora" aria-hidden="true"><i /><i /><i /><i /></div>
    <section className="auth-story" aria-label="Foco">
      <div className="auth-brand"><span><Asterisk /></span><strong>foco<i>.</i></strong></div>
      <div className="auth-story-copy">
        <span className="auth-kicker"><Sparkles /> O teu dia, à tua maneira</span>
        <h1>Menos ruído.<br /><em>Mais feito.</em></h1>
        <p>Tarefas, tempo e prioridades num espaço só teu.</p>
      </div>
      <div className="auth-colour-key" aria-hidden="true"><span /><span /><span /><span /></div>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        {(effectiveMode === 'forgot' || effectiveMode === 'recovery') && <button type="button" className="auth-back" onClick={() => { auth.leaveRecovery(); changeMode('signin'); }}><ArrowLeft />Voltar</button>}
        <header><h2>{copy.title}</h2><p>{copy.note}</p></header>
        <form onSubmit={submit}>
          {effectiveMode === 'signup' && <label className="auth-field"><span>Nome</span><div><UserRound /><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Como te devemos chamar?" required maxLength={80} /></div></label>}
          {effectiveMode !== 'recovery' && <label className="auth-field"><span>Email</span><div><Mail /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="nome@exemplo.com" required /></div></label>}
          {effectiveMode !== 'forgot' && <label className="auth-field"><span>{effectiveMode === 'recovery' ? 'Nova palavra-passe' : 'Palavra-passe'}</span><div><LockKeyhole /><input type={visible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={effectiveMode === 'signin' ? 'current-password' : 'new-password'} placeholder="Mínimo de 8 caracteres" minLength={8} required /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}>{visible ? <EyeOff /> : <Eye />}</button></div></label>}
          {effectiveMode === 'recovery' && <label className="auth-field"><span>Confirmar palavra-passe</span><div><KeyRound /><input type={visible ? 'text' : 'password'} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" placeholder="Repete a nova palavra-passe" minLength={8} required /></div></label>}
          {effectiveMode === 'signin' && <button type="button" className="auth-forgot" onClick={() => changeMode('forgot')}>Esqueci-me da palavra-passe</button>}
          {error && <div className="auth-message error" role="alert">{error}</div>}
          {success && <div className="auth-message success" role="status"><Check />{success}</div>}
          <button className="auth-submit" disabled={busy || Boolean(success && effectiveMode !== 'recovery')}>
            <span>{busy ? 'A tratar disso…' : effectiveMode === 'signin' ? 'Entrar' : effectiveMode === 'signup' ? 'Criar o meu espaço' : effectiveMode === 'forgot' ? 'Enviar link' : 'Guardar palavra-passe'}</span><ArrowRight />
          </button>
        </form>
        {(effectiveMode === 'signin' || effectiveMode === 'signup') && <footer>{effectiveMode === 'signin' ? 'Ainda não tens uma conta?' : 'Já tens uma conta?'}<button type="button" onClick={() => changeMode(effectiveMode === 'signin' ? 'signup' : 'signin')}>{effectiveMode === 'signin' ? 'Criar conta' : 'Entrar'}</button></footer>}
      </div>
    </section>
  </main>;
}

