import { Archive, ArrowUpDown, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Circle, History, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AppState, Task } from '../../shared/types';
import { PageHeader } from '../components/PageHeader';
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

export function HistoryPage({ state, onOpenTask }: { state: AppState; onOpenTask: (id: string) => void }) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sort, setSort] = useState<SortFilter>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const activeFilters = Number(category !== 'all') + Number(Boolean(startDate || endDate));
  const clearFilters = () => { setCategory('all'); setStartDate(''); setEndDate(''); };

  return <div className="history-page">
    <PageHeader title="Histórico" />

    <section className="history-summary" aria-label="Resumo do histórico">
      <article><History /><span><strong>{state.tasks.length}</strong><small>No total</small></span></article>
      <article className="history-summary-done"><CheckCircle2 /><span><strong>{completed}</strong><small>Concluídas</small></span></article>
      <article><Circle /><span><strong>{pending}</strong><small>Pendentes</small></span></article>
      <article><Archive /><span><strong>{archived}</strong><small>Arquivadas</small></span></article>
    </section>

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
