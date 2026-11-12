import { Archive, ArrowUpDown, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Circle, History, Layers3, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import type { AppState, Project, Task } from '../../shared/types';
import { PageHeader } from '../components/PageHeader';
import { useApp } from '../context/AppContext';
import { categoryOf, isHidden, projectOf } from '../lib/domain';

type StatusFilter = 'all' | 'pending' | 'done';
type SortFilter = 'recent' | 'completed' | 'created' | 'title';

const taskMoment = (task: Task) => task.completedAt ?? task.updatedAt ?? task.createdAt;
const dateValue = (value: string) => new Date(value).getTime();
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('pt-PT') + value.slice(1);

function monthLabel(task: Task) {
  return capitalize(new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(new Date(taskMoment(task))));
}

function readableDate(value: string) {
  return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function inDateRange(task: Task, startDate: string, endDate: string) {
  const moment = dateValue(taskMoment(task));
  const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
  const end = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
  return (start === null || moment >= start) && (end === null || moment <= end);
}

function projectTaskTree(tasks: Task[]) {
  const ordered: Array<{ task: Task; depth: number }> = [];
  const children = new Map<string | null, Task[]>();
  tasks.forEach((task) => children.set(task.parentTaskId, [...(children.get(task.parentTaskId) ?? []), task]));
  children.forEach((items) => items.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)));
  const seen = new Set<string>();
  const visit = (task: Task, depth: number) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    ordered.push({ task, depth });
    (children.get(task.id) ?? []).forEach((child) => visit(child, depth + 1));
  };
  (children.get(null) ?? []).forEach((task) => visit(task, 0));
  tasks.filter((task) => !seen.has(task.id)).forEach((task) => visit(task, 0));
  return ordered;
}

export function HistoryPage({ state, onOpenTask }: { state: AppState; onOpenTask: (id: string) => void }) {
  const { mutate, busy, notify } = useApp();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sort, setSort] = useState<SortFilter>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const completed = state.tasks.filter((task) => task.status === 'done').length;
  const pending = state.tasks.length - completed;
  const archived = state.tasks.filter((task) => isHidden(state, task)).length;

  const filtered = useMemo(() => state.tasks.filter((task) => {
    if (status === 'pending' && task.status === 'done') return false;
    if (status === 'done' && task.status !== 'done') return false;
    if (category !== 'all' && (category === 'none' ? task.categoryId !== null : task.categoryId !== category)) return false;
    return inDateRange(task, startDate, endDate);
  }).sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, 'pt-PT');
    if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'completed') return (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || taskMoment(b).localeCompare(taskMoment(a));
    return taskMoment(b).localeCompare(taskMoment(a));
  }), [category, endDate, sort, startDate, state, status]);

  const groups = useMemo(() => {
    const result = new Map<string, Task[]>();
    filtered.forEach((task) => {
      const label = monthLabel(task);
      result.set(label, [...(result.get(label) ?? []), task]);
    });
    return [...result.entries()];
  }, [filtered]);

  const archivedProjects = useMemo(() => state.projects
    .filter((project) => project.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [state.projects]);
  const projectTasks = useMemo(() => new Map(archivedProjects.map((project) => [
    project.id,
    projectTaskTree(state.tasks.filter((task) => task.projectId === project.id)),
  ])), [archivedProjects, state.tasks]);

  const activeFilters = Number(category !== 'all') + Number(Boolean(startDate || endDate));
  const clearFilters = () => { setCategory('all'); setStartDate(''); setEndDate(''); };
  const toggleProject = (projectId: string) => setExpandedProjects((current) => {
    const next = new Set(current);
    next.has(projectId) ? next.delete(projectId) : next.add(projectId);
    return next;
  });
  const reopenProject = async (project: Project) => {
    const result = await mutate<Project>(`/api/projects/${project.id}`, 'PATCH', { archived: false }, { silent: true });
    if (result) notify(`“${project.name}” foi reaberto.`);
  };

  return <div className="history-page">
    <PageHeader title="Histórico" />

    <section className="history-summary" aria-label="Resumo do histórico">
      <article><History /><span><strong>{state.tasks.length}</strong><small>No total</small></span></article>
      <article className="history-summary-done"><CheckCircle2 /><span><strong>{completed}</strong><small>Concluídas</small></span></article>
      <article><Circle /><span><strong>{pending}</strong><small>Pendentes</small></span></article>
      <article><Archive /><span><strong>{archived}</strong><small>Arquivadas</small></span></article>
    </section>

    {archivedProjects.length > 0 && <section className="history-projects" aria-labelledby="completed-groups-title">
      <header><div><span className="history-kicker"><Layers3 />Objetivos terminados</span><h2 id="completed-groups-title">Grupos concluídos</h2><p>Consulta o que ficou feito e o que ficou por fazer, sem alterar o estado das tarefas.</p></div><strong>{archivedProjects.length}</strong></header>
      <div className="history-project-cards">{archivedProjects.map((project) => {
        const items = projectTasks.get(project.id) ?? [];
        const completedCount = items.filter(({ task }) => task.status === 'done').length;
        const pendingCount = items.length - completedCount;
        const expanded = expandedProjects.has(project.id);
        const itemCategory = state.categories.find((categoryItem) => categoryItem.id === project.categoryId);
        const regionId = `history-project-${project.id}`;
        return <article className={`history-project-card ${expanded ? 'expanded' : ''}`} key={project.id}>
          <div className="history-project-card-head">
            <button type="button" className="history-project-toggle" onClick={() => toggleProject(project.id)} aria-expanded={expanded} aria-controls={regionId}>
              <span className="history-project-icon" style={{ '--project-color': itemCategory?.color ?? 'var(--primary)' } as CSSProperties}><Layers3 /></span>
              <span className="history-project-name"><strong>{project.name}</strong><small>{itemCategory?.name ?? 'Sem categoria'} · terminado em {readableDate(project.updatedAt)}</small></span>
              <span className="history-project-counts"><em className="complete">{completedCount} {completedCount === 1 ? 'concluída' : 'concluídas'}</em><em className="pending">{pendingCount} por fazer</em></span>
              <ChevronDown />
            </button>
            {pendingCount > 0 && <button type="button" className="button subtle history-project-reopen" disabled={busy} onClick={() => void reopenProject(project)} title="Voltar a mostrar este grupo nas tarefas"><RotateCcw />Reabrir</button>}
          </div>
          {expanded && <div className="history-project-task-list" id={regionId}>
            {items.length ? items.map(({ task, depth }) => {
              const done = task.status === 'done';
              return <button type="button" className="history-project-task" key={task.id} onClick={() => onOpenTask(task.id)} style={{ '--task-indent': `${Math.min(depth, 4) * 13}px` } as CSSProperties}>
                <span className={`history-row-status ${done ? 'done' : ''}`}>{done ? <CheckCircle2 /> : <Circle />}</span>
                <span><strong className={done ? 'done' : ''}>{task.title}</strong><small>{task.parentTaskId ? 'Subtarefa' : 'Tarefa principal'}</small></span>
                <em className={done ? 'complete' : 'pending'}>{done ? 'Concluída' : 'Por fazer'}</em><ChevronRight />
              </button>;
            }) : <p className="history-project-no-tasks">Este grupo já não tem tarefas associadas.</p>}
          </div>}
        </article>;
      })}</div>
    </section>}

    <div className="history-toolbar">
      <div className="status-tabs" role="group" aria-label="Estado das tarefas">
        <button className={status === 'pending' ? 'active' : ''} aria-pressed={status === 'pending'} onClick={() => setStatus('pending')}>Pendentes</button>
        <button className={status === 'done' ? 'active' : ''} aria-pressed={status === 'done'} onClick={() => setStatus('done')}>Concluídas</button>
        <button className={status === 'all' ? 'active' : ''} aria-pressed={status === 'all'} onClick={() => setStatus('all')}>Todas</button>
      </div>
      <div className="history-actions">
        <button className={`button filter-toggle ${filtersOpen ? 'active' : ''}`} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><SlidersHorizontal />Filtrar{activeFilters > 0 && <b>{activeFilters}</b>}<ChevronDown /></button>
        <label className="history-sort"><ArrowUpDown aria-hidden="true" /><span>Ordenar</span><select value={sort} onChange={(event) => setSort(event.target.value as SortFilter)} aria-label="Ordenar histórico"><option value="recent">Atividade recente</option><option value="completed">Conclusão recente</option><option value="created">Criação recente</option><option value="title">Nome A–Z</option></select></label>
      </div>
    </div>

    {filtersOpen && <section className="history-filters" aria-label="Filtros do histórico">
      <label><span>Categoria</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas as categorias</option><option value="none">Sem categoria</option>{state.categories.map((item) => <option key={item.id} value={item.id}>{item.icon ? `${item.icon} ` : ''}{item.name}{item.archived ? ' — arquivada' : ''}</option>)}</select></label>
      <div className="history-date-range">
        <span>Período da atividade</span>
        <div><label><span>Data de início</span><input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label><label><span>Data de fim</span><input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label></div>
      </div>
      {activeFilters > 0 && <button className="button subtle" onClick={clearFilters}>Limpar filtros</button>}
    </section>}

    <section className="history-timeline">
      <header><div><span className="history-kicker"><CalendarDays />Linha temporal</span><h2>{filtered.length} {filtered.length === 1 ? 'tarefa' : 'tarefas'}</h2></div></header>
      {groups.length ? groups.map(([label, tasks]) => <section className="history-month" key={label}>
        <h3><span>{label}</span><small>{tasks.length}</small></h3>
        <div className="history-list">{tasks.map((task) => {
          const itemCategory = categoryOf(state, task);
          const itemProject = projectOf(state, task);
          const hidden = isHidden(state, task);
          const done = task.status === 'done';
          return <button className="history-row" key={task.id} onClick={() => onOpenTask(task.id)}>
            <span className={`history-row-status ${done ? 'done' : ''}`}>{done ? <CheckCircle2 /> : <Circle />}</span>
            <span className="history-row-main"><strong className={done ? 'done' : ''}>{task.title}</strong><small>{itemCategory ? <><i style={{ background: itemCategory.color }} />{itemCategory.name}{itemProject ? ` › ${itemProject.name}` : ''}</> : 'Sem categoria'}<span>·</span>{done && task.completedAt ? `Concluída em ${readableDate(task.completedAt)}` : `Atualizada em ${readableDate(task.updatedAt)}`}</small></span>
            <span className="history-row-side">{hidden && <em>Arquivada</em>}{!hidden && <em className={done ? 'complete' : 'pending'}>{done ? 'Concluída' : 'Pendente'}</em>}<ChevronRight /></span>
          </button>;
        })}</div>
      </section>) : <div className="history-empty"><span>✓</span><h3>Nenhuma tarefa encontrada</h3><p>Experimenta alterar os filtros do histórico.</p></div>}
    </section>
  </div>;
}
