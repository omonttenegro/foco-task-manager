import { Archive, ArrowLeft, Check, Clock3, Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PlannedSession, Priority, Task, TaskStatus } from '../../shared/types';
import { useApp } from '../context/AppContext';
import { allocatedMinutes, childrenOf, formatDuration, isHidden, projectOf, remainingMinutes, sessionsOf } from '../lib/domain';
import { dayLabel, today } from '../lib/dates';

type FormState = {
  title: string; description: string; status: TaskStatus; priority: '' | `${Priority}`;
  deadline: string; estimatedDuration: string; categoryId: string; projectId: string; parentTaskId: string;
};

const emptyForm: FormState = { title: '', description: '', status: 'todo', priority: '', deadline: '', estimatedDuration: '', categoryId: '', projectId: '', parentTaskId: '' };

export function TaskDrawer({ selected, context, onClose, onSelect }: {
  selected: string | 'new' | null; context?: { categoryId?: string }; onClose: () => void; onSelect: (id: string) => void;
}) {
  const { state, mutate, busy, notify } = useApp();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [subtask, setSubtask] = useState('');
  const [sessionDate, setSessionDate] = useState(today());
  const [sessionDuration, setSessionDuration] = useState('30');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const drawer = useRef<HTMLElement>(null);
  const task = state && selected && selected !== 'new' ? state.tasks.find((item) => item.id === selected) ?? null : null;
  const creating = selected === 'new';

  useEffect(() => {
    if (!selected || !state) return;
    const source = task;
    setForm(source ? {
      title: source.title, description: source.description, status: source.status, priority: source.priority ? String(source.priority) as `${Priority}` : '',
      deadline: source.deadline ?? '', estimatedDuration: source.estimatedDuration == null ? '' : String(source.estimatedDuration),
      categoryId: source.categoryId ?? '', projectId: source.projectId ?? projectOf(state, source)?.id ?? '', parentTaskId: source.parentTaskId ?? ''
    } : { ...emptyForm, categoryId: context?.categoryId ?? '' });
    saveLock.current = false;
    setSaving(false);
    setSubtask(''); setSessionDate(today());
    window.setTimeout(() => drawer.current?.querySelector<HTMLInputElement>('#task-title')?.focus(), 30);
  }, [selected, state, task?.updatedAt, context?.categoryId]);

  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab' || !drawer.current) return;
      const focusable = [...drawer.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); drawer.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [Boolean(selected)]);

  if (!selected || !state) return null;
  const children = task ? childrenOf(state, task.id) : [];
  const sessions = task ? sessionsOf(state, task.id) : [];
  const selectedCategoryId = form.categoryId || null;
  const selectedProjectId = form.projectId || null;
  const projectOptions = state.projects.filter((item) => item.categoryId === selectedCategoryId && (!item.archived || item.id === form.projectId));
  const selectedProject = projectOptions.find((item) => item.id === form.projectId);
  const parentOptions = state.tasks.filter((item) => item.id !== task?.id && !isHidden(state, item) && item.categoryId === selectedCategoryId && item.projectId === selectedProjectId);

  const field = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saveLock.current) return;
    const openChildren = task ? children.filter((item) => item.status !== 'done') : [];
    let forceComplete = false;
    if (task && form.status === 'done' && task.status !== 'done' && openChildren.length) {
      forceComplete = window.confirm(`Existem ${openChildren.length} subtarefas por concluir. Ao concluir a tarefa principal, toda a família sai das vistas ativas e vai para o histórico, mas os checks das subtarefas mantêm-se como estão. Queres continuar?`);
      if (!forceComplete) return;
    }
    saveLock.current = true;
    setSaving(true);
    const payload = {
      title: form.title, description: form.description, status: form.status,
      priority: form.priority ? Number(form.priority) : null, deadline: form.deadline || null,
      estimatedDuration: form.estimatedDuration === '' ? null : Number(form.estimatedDuration),
      categoryId: form.categoryId || null, projectId: form.projectId || null, parentTaskId: form.parentTaskId || null, forceComplete
    };
    const request = mutate<Task>(creating ? '/api/tasks' : `/api/tasks/${task!.id}`, creating ? 'POST' : 'PATCH', payload);
    // The drawer responds immediately on mobile while the already-deduplicated
    // mutation finishes in the background. The context reports any failure.
    onClose();
    await request;
  };
  const createSubtask = async (event: FormEvent) => {
    event.preventDefault(); if (!task || !subtask.trim()) return;
    const result = await mutate<Task>('/api/tasks', 'POST', { title: subtask, parentTaskId: task.id, categoryId: task.categoryId }, { silent: true });
    if (result) { setSubtask(''); notify('Subtarefa adicionada.'); }
  };
  const addSession = async (event: FormEvent) => {
    event.preventDefault(); if (!task) return;
    const result = await mutate<PlannedSession>('/api/sessions', 'POST', { taskId: task.id, plannedDate: sessionDate, plannedDuration: Number(sessionDuration) }, { silent: true });
    if (result) notify('Sessão planeada.');
  };
  const remove = async () => {
    if (!task || !window.confirm(`Eliminar definitivamente “${task.title}”? As subtarefas tornam-se tarefas de topo e as sessões desta tarefa serão removidas.`)) return;
    const result = await mutate(`/api/tasks/${task.id}`, 'DELETE', undefined, { silent: true });
    if (result) { notify('Tarefa eliminada.'); onClose(); }
  };

  return <><button className="drawer-backdrop" aria-label="Fechar detalhes" onClick={onClose} />
    <aside className="task-drawer" ref={drawer} role="dialog" aria-modal="true" aria-labelledby="task-drawer-title" tabIndex={-1}>
      <header className={`drawer-head ${creating ? 'drawer-head-new' : ''}`}>
        <button className="drawer-back" onClick={onClose}><ArrowLeft />Voltar</button>
        <div><h1 className="drawer-title" id="task-drawer-title">{creating ? 'Nova tarefa' : 'Detalhes da tarefa'}</h1>{task?.status === 'done' && <small>{`Concluída ${task.completedAt ? new Date(task.completedAt).toLocaleString('pt-PT') : ''}`}</small>}</div>
      </header>
      <div className="drawer-scroll">
        <form id="task-form" onSubmit={save} className="task-form">
          <div className="field"><label htmlFor="task-title">Título *</label><input id="task-title" value={form.title} onChange={(event) => field('title', event.target.value)} required maxLength={300} placeholder="O que precisas de fazer?" className="title-input" /></div>
          <div className="field"><label htmlFor="task-description">Descrição</label><textarea id="task-description" value={form.description} onChange={(event) => field('description', event.target.value)} maxLength={30000} placeholder="Notas, links ou contexto…" /></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="task-status">Estado</label><select id="task-status" value={form.status} onChange={(event) => field('status', event.target.value as TaskStatus)}><option value="todo">Por fazer</option><option value="progress">Em progresso</option><option value="done">Concluída</option></select></div>
            <div className="field"><label htmlFor="task-priority">Prioridade</label><select id="task-priority" value={form.priority} onChange={(event) => field('priority', event.target.value as FormState['priority'])}><option value="">Sem prioridade</option><option value="1">P1 — Urgente</option><option value="2">P2 — Alta</option><option value="3">P3 — Média</option><option value="4">P4 — Baixa</option></select></div>
          </div>
          <details className="form-disclosure">
            <summary><span>Prazo e estimativa</span><small>{form.deadline || form.estimatedDuration ? 'Definido' : 'Opcional'}</small></summary>
            <div className="form-grid disclosure-content">
              <div className="field"><label htmlFor="task-deadline">Deadline</label><input id="task-deadline" type="date" value={form.deadline} onChange={(event) => field('deadline', event.target.value)} /></div>
              <div className="field"><label htmlFor="task-duration">Duração estimada</label><input id="task-duration" type="number" min="0" max="200000" step="5" value={form.estimatedDuration} onChange={(event) => field('estimatedDuration', event.target.value)} placeholder="Minutos" /><div className="quick-values">{[15,30,60,120].map((value) => <button type="button" key={value} onClick={() => field('estimatedDuration', String(value))}>{value < 60 ? `${value}m` : `${value / 60}h`}</button>)}</div></div>
            </div>
          </details>
          <details className="form-disclosure">
            <summary><span>Organização</span><small>{selectedProject?.name ?? (form.categoryId ? 'Categoria definida' : 'Sem categoria')}</small></summary>
            <div className="disclosure-content">
              <div className="field"><label htmlFor="task-category">Categoria</label><select id="task-category" value={form.categoryId} onChange={(event) => { const categoryId = event.target.value; setForm((current) => { const currentParent = state.tasks.find((item) => item.id === current.parentTaskId); return { ...current, categoryId, projectId: '', parentTaskId: currentParent?.categoryId === (categoryId || null) && currentParent.projectId === null ? current.parentTaskId : '' }; }); }}><option value="">Sem categoria</option>{state.categories.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.icon ? `${item.icon} ` : ''}{item.name}</option>)}</select></div>
              {form.categoryId && <div className="field"><label htmlFor="task-project">Grupo temporário</label><select id="task-project" value={form.projectId} onChange={(event) => { const projectId = event.target.value; setForm((current) => { const currentParent = state.tasks.find((item) => item.id === current.parentTaskId); return { ...current, projectId, parentTaskId: currentParent?.projectId === (projectId || null) ? current.parentTaskId : '' }; }); }}><option value="">Sem grupo</option>{projectOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.archived ? ' — no Histórico' : ''}</option>)}</select></div>}
              <div className="field"><label htmlFor="task-parent">Tarefa principal</label><select id="task-parent" value={form.parentTaskId} onChange={(event) => field('parentTaskId', event.target.value)}><option value="">Nenhuma</option>{parentOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
            </div>
          </details>
        </form>

        {task && <div className="detail-sections">
          <details className="detail-disclosure"><summary><span>Subtarefas</span><small>{children.filter((item) => item.status === 'done').length}/{children.length}</small></summary><div className="detail-disclosure-body">
            {children.map((child) => <button className="detail-line" key={child.id} onClick={() => onSelect(child.id)}><span className={child.status === 'done' ? 'done' : ''}>{child.status === 'done' ? '✓ ' : ''}{child.title}</span><span>Ver →</span></button>)}
            <form className="inline-form" onSubmit={createSubtask}><label className="sr-only" htmlFor="new-subtask">Nova subtarefa</label><input id="new-subtask" value={subtask} onChange={(event) => setSubtask(event.target.value)} placeholder="Nova subtarefa…" maxLength={300} /><button className="button small" disabled={busy} aria-label="Adicionar subtarefa"><Plus /></button></form>
          </div></details>
          <details className="detail-disclosure"><summary><span>Sessões planeadas</span><small>{sessions.length || 'Nenhuma'}</small></summary><div className="detail-disclosure-body">
            {sessions.map((session) => <div className="detail-line" key={session.id}><span>{dayLabel(session.plannedDate, 'd MMM yyyy')} · {formatDuration(session.plannedDuration)} {session.status === 'done' ? '✓' : ''}</span><button className="text-button danger-text" onClick={() => window.confirm('Retirar esta sessão do planeamento?') && void mutate(`/api/sessions/${session.id}`, 'DELETE', undefined, { silent: true })}>Retirar</button></div>)}
            {task.estimatedDuration != null && <p className="form-help"><Clock3 /> Alocadas {formatDuration(allocatedMinutes(state, task.id))} de {formatDuration(task.estimatedDuration)} · faltam {formatDuration(remainingMinutes(state, task))}</p>}
            <form className="session-form" onSubmit={addSession}><div><label htmlFor="session-date">Data</label><input id="session-date" type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} required /></div><div><label htmlFor="session-duration">Minutos</label><input id="session-duration" type="number" min="0" step="5" value={sessionDuration} onChange={(event) => setSessionDuration(event.target.value)} required /></div><button className="button small" disabled={busy} aria-label="Adicionar sessão"><Plus /></button></form>
          </div></details>
        </div>}
        {task && <footer className="drawer-actions"><details className="drawer-more-actions"><summary>Mais ações</summary><div><button className="button subtle" onClick={() => void mutate<Task>(`/api/tasks/${task.id}/duplicate`, 'POST').then((result) => result && onSelect(result.id))}><Copy />Duplicar</button>{task.archived && <button className="button subtle" onClick={() => void mutate(`/api/tasks/${task.id}`, 'PATCH', { archived: false }).then((result) => result && onClose())}><Archive />Recuperar</button>}<button className="button danger" onClick={() => void remove()}><Trash2 />Eliminar</button></div></details></footer>}
        <div className="drawer-primary-action"><button className="button primary" type="submit" form="task-form" disabled={busy || saving}><Check />{saving ? 'A guardar…' : creating ? 'Criar tarefa' : 'Guardar alterações'}</button></div>
      </div>
    </aside>
  </>;
}

