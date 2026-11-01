import { Check, Download, Layers3, LogOut, ShieldCheck, Upload, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AppAccent, Backup, CalendarView, Category, PlannedSession, Project, Settings, Theme } from '../../shared/types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { categoryOf, formatDuration, pendingTasks, projectOf, remainingMinutes } from '../lib/domain';
import { dayLabel } from '../lib/dates';
import { applyTheme, getAppliedAccent } from '../lib/theme';
import { Dialog } from './Dialog';

export type ModalState =
  | { type: 'category'; id?: string }
  | { type: 'project'; categoryId: string; id?: string }
  | { type: 'settings' }
  | { type: 'profile' }
  | { type: 'plan'; day: string; taskId?: string }
  | { type: 'session'; id: string }
  | null;

const accentChoices: Array<{ value: AppAccent; label: string; colors: [string, string] }> = [
  { value: 'pink', label: 'Rosa', colors: ['#ef2b87', '#ff85be'] },
  { value: 'blue', label: 'Azul', colors: ['#1f64e8', '#79a7ff'] },
  { value: 'violet', label: 'Violeta', colors: ['#7c3aed', '#c4a1ff'] },
  { value: 'emerald', label: 'Verde', colors: ['#0b8f70', '#5ee0b7'] },
];

export function AppDialogs({ modal, onClose, onCreated }: { modal: ModalState; onClose: () => void; onCreated: (kind: 'category' | 'project', id: string, categoryId?: string) => void }) {
  const { state, refresh } = useApp();
  if (!modal || !state) return null;
  if (modal.type === 'category') return <CategoryDialog id={modal.id} onClose={onClose} onCreated={onCreated} />;
  if (modal.type === 'project') return <ProjectDialog id={modal.id} categoryId={modal.categoryId} onClose={onClose} onCreated={onCreated} />;
  if (modal.type === 'settings') return <SettingsDialog onClose={onClose} onImported={refresh} />;
  if (modal.type === 'profile') return <ProfileDialog onClose={onClose} />;
  if (modal.type === 'plan') {
    const tasks = pendingTasks(state);
    return <PlanDialog day={modal.day} initialTaskId={modal.taskId} onClose={onClose} />;
  }
  const session = state.sessions.find((item) => item.id === modal.id);
  return session ? <SessionDialog session={session} onClose={onClose} /> : null;
}

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, updatePassword, updateProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(String(user?.user_metadata.full_name ?? ''));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const initials = (fullName || user?.email || 'F').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    const profileResult = await updateProfile({ fullName });
    if (profileResult.error) { setMessage({ text: profileResult.error, error: true }); setBusy(false); return; }
    if (password) {
      const passwordResult = await updatePassword(password);
      if (passwordResult.error) { setMessage({ text: passwordResult.error, error: true }); setBusy(false); return; }
      setPassword('');
    }
    setMessage({ text: 'Perfil atualizado.' }); setBusy(false);
  };
  return <Dialog title="O teu perfil" onClose={onClose}>
    <form className="dialog-body profile-dialog" onSubmit={save}>
      <div className="profile-identity">
        <span className="profile-avatar">{initials || <UserRound />}</span>
        <div><strong>{fullName || 'O teu nome'}</strong><span>{user?.email}</span><small><ShieldCheck /> Espaço privado e sincronizado</small></div>
      </div>
      <div className="field"><label htmlFor="profile-name">Nome</label><input id="profile-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={80} autoComplete="name" /></div>
      <div className="field"><label>Email</label><input value={user?.email ?? ''} disabled /></div>
      <details className="profile-password"><summary>Alterar palavra-passe</summary><div className="field"><label htmlFor="profile-password">Nova palavra-passe</label><input id="profile-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" placeholder="Deixa vazio para manter a atual" /></div></details>
      {message && <div className={`profile-message ${message.error ? 'error' : ''}`}>{message.text}</div>}
      <div className="dialog-actions"><button type="button" className="button danger" onClick={() => void signOut()}><LogOut />Sair</button><span /><button type="button" className="button subtle" onClick={onClose}>Fechar</button><button className="button primary" disabled={busy}>{busy ? 'A guardar…' : 'Guardar perfil'}</button></div>
    </form>
  </Dialog>;
}

function CategoryDialog({ id, onClose, onCreated }: { id?: string; onClose: () => void; onCreated: (kind: 'category', id: string) => void }) {
  const { state, mutate, busy } = useApp();
  const item = state?.categories.find((current) => current.id === id);
  const [name, setName] = useState(item?.name ?? ''); const [color, setColor] = useState(item?.color ?? '#6366f1'); const [icon, setIcon] = useState(item?.icon ?? '');
  const save = async (event: FormEvent) => { event.preventDefault(); const result = await mutate<Category>(`/api/categories${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', { name, color, icon: icon || null }); if (result) { onClose(); onCreated('category', result.id); } };
  const remove = async () => { if (!item || !window.confirm(`Eliminar “${item.name}”? As tarefas passam a ficar sem categoria.`)) return; if (await mutate(`/api/categories/${item.id}`, 'DELETE')) onClose(); };
  return <Dialog title={item ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}><form onSubmit={save} className="dialog-body"><div className="field"><label htmlFor="category-name">Nome *</label><input id="category-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></div><div className="form-grid"><div className="field"><label htmlFor="category-icon">Ícone</label><input id="category-icon" value={icon} onChange={(event) => setIcon(event.target.value)} maxLength={30} placeholder="Ex.: 🎓" /></div><div className="field"><label htmlFor="category-color">Cor</label><div className="category-color-picker"><input className="category-color-input" id="category-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><label htmlFor="category-color"><strong>Escolher cor</strong><small>{color.toUpperCase()}</small></label></div></div></div><div className="dialog-actions">{item && <><button type="button" className="button danger" onClick={() => void remove()}>Eliminar</button><button type="button" className="button subtle" onClick={() => void mutate(`/api/categories/${item.id}`, 'PATCH', { archived: !item.archived }).then(() => onClose())}>{item.archived ? 'Recuperar' : 'Arquivar'}</button></>}<span /><button type="button" className="button subtle" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>Guardar</button></div></form></Dialog>;
}

function ProjectDialog({ id, categoryId, onClose, onCreated }: { id?: string; categoryId: string; onClose: () => void; onCreated: (kind: 'project', id: string, categoryId?: string) => void }) {
  const { state, mutate, busy } = useApp();
  const item = state?.projects.find((current) => current.id === id);
  const [name, setName] = useState(item?.name ?? '');
  const [selectedCategoryId, setSelectedCategoryId] = useState(item?.categoryId ?? categoryId);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(() => state?.tasks
    .filter((task) => task.projectId === id && task.parentTaskId === null && task.status !== 'done' && !task.archived)
    .map((task) => task.id) ?? []);
  const availableTasks = state?.tasks.filter((task) => task.categoryId === selectedCategoryId
    && task.parentTaskId === null
    && task.status !== 'done'
    && !task.archived
    && (task.projectId === null || task.projectId === item?.id)) ?? [];
  const toggleTask = (taskId: string) => setSelectedTaskIds((current) => current.includes(taskId)
    ? current.filter((currentId) => currentId !== taskId)
    : [...current, taskId]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTaskIds.length) return;
    const result = await mutate<Project>(`/api/projects${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', {
      name, description: item?.description ?? '', categoryId: selectedCategoryId, color: null, taskIds: selectedTaskIds
    });
    if (result) { onClose(); onCreated('project', result.id, result.categoryId); }
  };
  const remove = async () => {
    if (!item || !window.confirm(`Eliminar o grupo “${item.name}”? As tarefas mantêm-se, mas ficam sem grupo.`)) return;
    if (await mutate(`/api/projects/${item.id}`, 'DELETE')) onClose();
  };
  return <Dialog title={item ? 'Editar grupo temporário' : 'Agrupar tarefas'} onClose={onClose}><form onSubmit={save} className="dialog-body temporary-group-dialog">
    <div className="field"><label htmlFor="project-name">Nome do objetivo *</label><input id="project-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Ex.: Teste de Contabilidade, Evento de novembro" /></div>
    <div className="field"><label htmlFor="project-category">Categoria</label><select id="project-category" value={selectedCategoryId} onChange={(event) => { setSelectedCategoryId(event.target.value); setSelectedTaskIds([]); }} required>{state?.categories.filter((category) => !category.archived).map((category) => <option key={category.id} value={category.id}>{category.icon ? `${category.icon} ` : ''}{category.name}</option>)}</select></div>
    <fieldset className="temporary-group-tasks"><legend>Tarefas deste objetivo <small>{selectedTaskIds.length} selecionada{selectedTaskIds.length === 1 ? '' : 's'}</small></legend>
      {availableTasks.length ? <div>{availableTasks.map((task) => {
        const childCount = state?.tasks.filter((child) => child.parentTaskId === task.id).length ?? 0;
        const checked = selectedTaskIds.includes(task.id);
        return <label key={task.id} className={checked ? 'selected' : ''}><input type="checkbox" checked={checked} onChange={() => toggleTask(task.id)} /><span className="temporary-group-check"><Check /></span><span><strong>{task.title}</strong><small>{childCount ? `${childCount} subtarefa${childCount === 1 ? '' : 's'}` : 'Tarefa principal'}</small></span></label>;
      })}</div> : <div className="temporary-group-empty"><Layers3 /><strong>Não há tarefas livres nesta categoria</strong><p>Cria primeiro uma tarefa ou retira-a de outro grupo.</p></div>}
    </fieldset>
    <div className="dialog-actions">{item && <button type="button" className="button danger" onClick={() => void remove()}>Eliminar grupo</button>}<span /><button type="button" className="button subtle" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy || !selectedTaskIds.length}>{item ? 'Guardar' : 'Criar grupo'}</button></div>
  </form></Dialog>;
}

function SettingsDialog({ onClose, onImported }: { onClose: () => void; onImported: () => Promise<void> }) {
  const { state, mutate, notify } = useApp(); const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Settings>({
    ...state!.settings,
    accent: state!.settings.accent ?? getAppliedAccent(),
  });
  const formRef = useRef(form);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...formRef.current, [key]: value };
    formRef.current = next;
    setForm(next);
    if (key === 'theme' || key === 'accent') applyTheme(next.theme as Theme, next.accent);
    saveQueue.current = saveQueue.current.then(() => mutate<Settings>('/api/settings', 'PATCH', next, { silent: true }));
  };
  const exportBackup = async () => { try { const result = await api<Backup>('/api/export'); const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `foco-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); notify('Backup exportado.'); } catch (error) { notify(error instanceof Error ? error.message : 'Falha ao exportar.', 'error'); } };
  const importBackup = async (file: File) => { try { const parsed = JSON.parse(await file.text()); if (!window.confirm('A importação substitui todos os dados atuais. Queres continuar?')) return; await api('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) }); await onImported(); notify('Backup importado.'); onClose(); } catch (error) { notify(error instanceof Error ? error.message : 'Backup inválido.', 'error'); } };
  return <Dialog title="Definições" onClose={onClose}><div className="dialog-body"><div className="field settings-accent-field"><label id="accent-label">Cor da aplicação</label><div className="accent-options" role="radiogroup" aria-labelledby="accent-label">{accentChoices.map((choice) => <button key={choice.value} type="button" role="radio" aria-checked={form.accent === choice.value} className={`accent-option ${form.accent === choice.value ? 'active' : ''}`} onClick={() => updateSetting('accent', choice.value)}><span className="accent-swatch" style={{ background: `linear-gradient(145deg,${choice.colors[0]},${choice.colors[1]})` }} /><strong>{choice.label}</strong><Check /></button>)}</div></div><div className="form-grid"><div className="field"><label htmlFor="theme">Tema</label><select id="theme" value={form.theme} onChange={(event) => updateSetting('theme', event.target.value as Theme)}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></div><div className="field"><label htmlFor="calendar-view">Vista predefinida</label><select id="calendar-view" value={form.preferredCalendarView} onChange={(event) => updateSetting('preferredCalendarView', event.target.value as CalendarView)}><option value="week">Semana</option><option value="month">Mês</option><option value="day">Dia</option></select></div></div><div className="form-grid"><div className="field"><label htmlFor="week-start">Início da semana</label><select id="week-start" value={form.weekStartsOn} onChange={(event) => updateSetting('weekStartsOn', Number(event.target.value) as 0 | 1)}><option value="1">Segunda-feira</option><option value="0">Domingo</option></select></div><div className="field"><label htmlFor="capacity">Capacidade diária</label><input id="capacity" type="number" min="0" max="1440" step="30" value={form.dailyCapacityMinutes} onChange={(event) => updateSetting('dailyCapacityMinutes', Number(event.target.value))} /><small>{formatDuration(form.dailyCapacityMinutes)}</small></div></div><div className="backup-panel"><div><strong>Backup dos teus dados</strong><p>Exporta categorias, tarefas, sessões e preferências num único ficheiro JSON.</p></div><div><button className="button subtle" type="button" onClick={() => void exportBackup()}><Download />Exportar</button><button className="button subtle" type="button" onClick={() => fileRef.current?.click()}><Upload />Importar</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.currentTarget.value = ''; }} /></div></div><div className="settings-autosave" aria-live="polite"><span>As alterações são guardadas automaticamente.</span><button type="button" className="button subtle" onClick={onClose}>Fechar</button></div></div></Dialog>;
}

function PlanDialog({ day, initialTaskId, onClose }: { day: string; initialTaskId?: string; onClose: () => void }) {
  const { state, mutate, busy } = useApp(); const tasks = pendingTasks(state!); const first = initialTaskId ?? tasks[0]?.id ?? '';
  const [taskId, setTaskId] = useState(first); const task = tasks.find((item) => item.id === taskId); const [duration, setDuration] = useState(String(task ? remainingMinutes(state!, task) || task.estimatedDuration || 30 : 30));
  useEffect(() => { if (task) setDuration(String(remainingMinutes(state!, task) || task.estimatedDuration || 30)); }, [taskId]);
  const save = async (event: FormEvent) => { event.preventDefault(); if (!task) return; if (await mutate('/api/sessions', 'POST', { taskId, plannedDate: day, plannedDuration: Number(duration) })) onClose(); };
  return <Dialog title={`Planear para ${dayLabel(day, 'd MMMM')}`} onClose={onClose}><form onSubmit={save} className="dialog-body"><div className="field"><label htmlFor="plan-task">Tarefa</label><select id="plan-task" value={taskId} onChange={(event) => setTaskId(event.target.value)} required><option value="">Escolher tarefa…</option>{tasks.map((item) => { const scope = projectOf(state!, item)?.name ?? categoryOf(state!, item)?.name; return <option key={item.id} value={item.id}>{scope ? `${scope} — ` : ''}{item.title}</option>; })}</select></div><div className="field"><label htmlFor="plan-duration">Duração em minutos</label><input id="plan-duration" type="number" min="0" step="5" value={duration} onChange={(event) => setDuration(event.target.value)} required /></div><div className="dialog-actions"><span /><button type="button" className="button subtle" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>Planear</button></div></form></Dialog>;
}

function SessionDialog({ session, onClose }: { session: PlannedSession; onClose: () => void }) {
  const { mutate, busy } = useApp(); const [date, setDate] = useState(session.plannedDate); const [duration, setDuration] = useState(String(session.plannedDuration)); const [completed, setCompleted] = useState(session.completedDuration == null ? '' : String(session.completedDuration)); const [status, setStatus] = useState(session.status);
  const save = async (event: FormEvent) => { event.preventDefault(); if (await mutate(`/api/sessions/${session.id}`, 'PATCH', { plannedDate: date, plannedDuration: Number(duration), completedDuration: completed === '' ? null : Number(completed), status })) onClose(); };
  return <Dialog title="Editar sessão" onClose={onClose}><form onSubmit={save} className="dialog-body"><div className="field"><label htmlFor="edit-session-date">Data</label><input id="edit-session-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div><div className="form-grid"><div className="field"><label htmlFor="edit-session-duration">Minutos planeados</label><input id="edit-session-duration" type="number" min="0" step="5" value={duration} onChange={(event) => setDuration(event.target.value)} required /></div><div className="field"><label htmlFor="edit-session-completed">Minutos realizados</label><input id="edit-session-completed" type="number" min="0" step="5" value={completed} onChange={(event) => setCompleted(event.target.value)} /></div></div><div className="field"><label htmlFor="edit-session-status">Estado</label><select id="edit-session-status" value={status} onChange={(event) => setStatus(event.target.value as PlannedSession['status'])}><option value="planned">Por realizar</option><option value="done">Realizada</option></select></div><div className="dialog-actions"><span /><button type="button" className="button subtle" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>Guardar</button></div></form></Dialog>;
}
