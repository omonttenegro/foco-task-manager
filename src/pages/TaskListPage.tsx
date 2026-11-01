import { ChevronDown, Edit3, Folder, Layers3, Plus, SlidersHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AppState, Task } from '../../shared/types';
import type { View } from '../App';
import { PageHeader } from '../components/PageHeader';
import { TaskRow } from '../components/TaskRow';
import { activeTasks, hasLatePlanning, isDeadlineOverdue, isHidden, isVisibleInActiveTree, sessionsForDay, sortTasks, tasksForCategory, type SortMode, uniqueTasksForSessions } from '../lib/domain';
import { plusDays, today } from '../lib/dates';

type Filters = { priority: string; category: string; deadline: string; planning: string; sort: SortMode };
const initialFilters: Filters = { priority: 'all', category: 'all', deadline: 'all', planning: 'all', sort: 'manual' };

function baseForView(state: AppState, view: View) {
  const active = activeTasks(state); const day = today();
  let base: Task[];
  switch (view.key) {
    case 'archive': return state.tasks.filter((task) => isHidden(state, task));
    case 'inbox': base = active; break;
    case 'today': base = uniqueTasksForSessions(state, sessionsForDay(state, day)); break;
    case 'tomorrow': base = uniqueTasksForSessions(state, sessionsForDay(state, plusDays(day, 1))); break;
    case 'upcoming': { const end = plusDays(day, 6); base = active.filter((task) => (task.deadline && task.deadline >= day && task.deadline <= end) || state.sessions.some((session) => session.taskId === task.id && session.plannedDate >= day && session.plannedDate <= end)); break; }
    case 'unplanned': base = active.filter((task) => !state.sessions.some((session) => session.taskId === task.id)); break;
    case 'high': base = active.filter((task) => task.priority === 1 || task.priority === 2); break;
    case 'overdue': base = active.filter((task) => isDeadlineOverdue(task, day)); break;
    case 'plannedLate': base = active.filter((task) => hasLatePlanning(state, task, day)); break;
    case 'category': base = tasksForCategory(state, view.id); break;
    default: base = active;
  }
  const ids = new Set(base.map((task) => task.id));
  let added = true;
  while (added) {
    added = false;
    active.forEach((task) => {
      if (task.parentTaskId && ids.has(task.parentTaskId) && !ids.has(task.id)) {
        ids.add(task.id);
        added = true;
      }
    });
  }
  return active.filter((task) => ids.has(task.id));
}

function viewCopy(state: AppState, view: View) {
  if (view.key === 'category') {
    const item = state.categories.find((category) => category.id === view.id);
    return { title: item?.name ?? 'Categoria' };
  }
  const copy: Record<string, string> = {
    inbox: 'Tarefas', today: 'Hoje', tomorrow: 'Amanhã', upcoming: 'Próximos 7 dias',
    unplanned: 'Por planear', archive: 'Arquivo', high: 'Prioridade alta', overdue: 'Prazos ultrapassados', plannedLate: 'Planeamento ultrapassado', search: 'Pesquisa'
  };
  return { title: copy[view.key] ?? 'Tarefas' };
}

export function TaskListPage({ state, view, search, onOpenTask, onModal }: { state: AppState; view: View; search: string; onOpenTask: (id: string) => void; onModal: (modal: import('../components/AppDialogs').ModalState) => void }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const rootNodes = useRef(new Map<string, HTMLDivElement>());
  const rootPositions = useRef(new Map<string, number>());
  const listBodyRef = useRef<HTMLDivElement>(null);
  const reservedSpace = useRef(0);
  const reserveTimer = useRef<number | null>(null);
  useEffect(() => { setFilters(initialFilters); setFiltersOpen(false); }, [view.key, 'id' in view ? view.id : '']);
  const base = useMemo(() => baseForView(state, view), [state, view]);
  const filtered = useMemo(() => sortTasks(base.filter((task) => {
    const categoryName = state.categories.find((item) => item.id === task.categoryId)?.name ?? '';
    const projectName = state.projects.find((item) => item.id === task.projectId)?.name ?? '';
    if (search && !`${task.title} ${task.description} ${categoryName} ${projectName}`.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt'))) return false;
    if (filters.priority !== 'all' && (filters.priority === 'none' ? task.priority !== null : String(task.priority) !== filters.priority)) return false;
    if (view.key !== 'archive' && !isVisibleInActiveTree(state, task)) return false;
    if (filters.category !== 'all' && (filters.category === 'none' ? task.categoryId !== null : task.categoryId !== filters.category)) return false;
    if (filters.deadline === 'none' && task.deadline) return false;
    if (filters.deadline === 'overdue' && !(task.deadline && task.deadline < today() && task.status !== 'done')) return false;
    if (filters.deadline === 'today' && task.deadline !== today()) return false;
    if (filters.deadline === 'week' && !(task.deadline && task.deadline >= today() && task.deadline <= plusDays(today(), 6))) return false;
    const sessions = state.sessions.filter((session) => session.taskId === task.id);
    if (filters.planning === 'none' && sessions.length) return false;
    if (filters.planning === 'today' && !sessions.some((session) => session.plannedDate === today())) return false;
    if (filters.planning === 'past' && !sessions.some((session) => session.plannedDate < today() && session.status !== 'done')) return false;
    return true;
  }), filters.sort), [base, filters, search, state]);
  const copy = viewCopy(state, view);
  const category = view.key === 'category' ? state.categories.find((item) => item.id === view.id) : null;
  const day = view.key === 'today' ? today() : view.key === 'tomorrow' ? plusDays(today(), 1) : undefined;
  const sessionMinutes = (taskId: string) => day ? sessionsForDay(state, day).filter((session) => session.taskId === taskId).reduce((sum, session) => sum + session.plannedDuration, 0) : undefined;
  const releaseReservedSpace = () => {
    const body = listBodyRef.current;
    if (!body || reservedSpace.current <= 0) return;
    if (reserveTimer.current != null) window.clearTimeout(reserveTimer.current);
    body.style.transition = 'padding-bottom 780ms cubic-bezier(.22,.8,.28,1)';
    window.requestAnimationFrame(() => { body.style.paddingBottom = '0px'; });
    reserveTimer.current = window.setTimeout(() => {
      body.style.removeProperty('padding-bottom');
      body.style.removeProperty('transition');
      reservedSpace.current = 0;
      reserveTimer.current = null;
    }, 820);
  };
  const reserveDepartingSpace = (height: number) => {
    const body = listBodyRef.current;
    if (!body) return;
    const bottomGap = Math.max(0, document.documentElement.scrollHeight - window.innerHeight - window.scrollY);
    const needed = Math.max(0, height + 9 - bottomGap);
    if (needed < 2) return;
    if (reserveTimer.current != null) window.clearTimeout(reserveTimer.current);
    reservedSpace.current = Math.max(reservedSpace.current, needed);
    body.style.transition = 'none';
    body.style.paddingBottom = `${reservedSpace.current}px`;
    // If the request fails and no row is removed, do not leave empty space.
    reserveTimer.current = window.setTimeout(releaseReservedSpace, 1800);
  };
  useEffect(() => () => {
    if (reserveTimer.current != null) window.clearTimeout(reserveTimer.current);
  }, []);
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    const pageY = window.scrollY;
    rootNodes.current.forEach((node, id) => {
      if (node.isConnected) next.set(id, node.getBoundingClientRect().top + pageY);
    });
    const removedTop = [...rootPositions.current]
      .filter(([id]) => !next.has(id))
      .reduce<number | null>((highest, [, top]) => highest == null ? top : Math.min(highest, top), null);
    if (removedTop != null) releaseReservedSpace();
    next.forEach((top, id) => {
      const previousTop = rootPositions.current.get(id);
      const node = rootNodes.current.get(id);
      if (previousTop == null || !node) return;
      // Only cards that were physically below a removed card should rise to
      // fill its space. Cards above it remain completely still.
      if (removedTop == null || previousTop <= removedTop) return;
      const distance = previousTop - top;
      if (distance < 2) return;
      node.animate([
        { transform: `translateY(${distance}px)`, offset: 0 },
        { transform: 'translateY(-13px)', offset: .48 },
        { transform: 'translateY(8px)', offset: .64 },
        { transform: 'translateY(-4px)', offset: .77 },
        { transform: 'translateY(2px)', offset: .88 },
        { transform: 'translateY(0)', offset: 1 }
      ], { duration: 780, easing: 'cubic-bezier(.22,.8,.28,1)' });
    });
    rootPositions.current = next;
  }, [filtered.map((task) => task.id).join('|')]);
  const renderTree = (tasks: Task[], groupBy: 'none' | 'category' | 'project' = 'none') => {
    const known = new Set(tasks.map((task) => task.id)); const map = new Map<string | null, Task[]>();
    tasks.forEach((task) => { const parent = task.parentTaskId && known.has(task.parentTaskId) ? task.parentTaskId : null; map.set(parent, [...(map.get(parent) ?? []), task]); });
    const walk = (task: Task, depth: number): ReactNode => {
      const nested = map.get(task.id) ?? [];
      const isCollapsed = collapsed.has(task.id);
      return <div className="task-tree-node" key={task.id} ref={depth === 0 ? (node) => { if (node) rootNodes.current.set(task.id, node); else rootNodes.current.delete(task.id); } : undefined}>
        <TaskRow state={state} task={task} onOpen={onOpenTask} depth={depth} tree collapsed={isCollapsed} onCollapse={() => setCollapsed((current) => { const next = new Set(current); next.has(task.id) ? next.delete(task.id) : next.add(task.id); return next; })} onBeforeDepart={reserveDepartingSpace} sessionMinutes={sessionMinutes(task.id)} showCategory={groupBy === 'none'} />
        {nested.length > 0 && <div className={`task-tree-children ${isCollapsed ? 'collapsed' : 'expanded'}`} aria-hidden={isCollapsed}><div>{nested.map((child) => walk(child, depth + 1))}</div></div>}
      </div>;
    };
    const roots = map.get(null) ?? [];
    if (groupBy === 'none') return roots.map((task) => walk(task, 0));

    const groups = new Map<string, Task[]>();
    roots.forEach((task) => {
      const key = groupBy === 'project' ? task.projectId ?? 'ungrouped' : task.categoryId ?? 'uncategorized';
      groups.set(key, [...(groups.get(key) ?? []), task]);
    });
    const knownItems = groupBy === 'project'
      ? state.projects.filter((item) => !item.archived && (!category || item.categoryId === category.id))
      : state.categories;
    const orderedKeys = [...knownItems.map((item) => item.id).filter((id) => groups.has(id)), ...[...groups.keys()].filter((id) => !knownItems.some((item) => item.id === id))];
    const familySize = (task: Task): number => 1 + (map.get(task.id) ?? []).reduce((total, child) => total + familySize(child), 0);
    return orderedKeys.map((key) => {
      const groupedTasks = groups.get(key) ?? [];
      const categoryItem = groupBy === 'category' && key !== 'uncategorized' ? state.categories.find((item) => item.id === key) ?? null : null;
      const projectItem = groupBy === 'project' && key !== 'ungrouped' ? state.projects.find((item) => item.id === key) ?? null : null;
      const amount = groupedTasks.reduce((total, task) => total + familySize(task), 0);
      const title = projectItem?.name ?? categoryItem?.name ?? (groupBy === 'project' ? 'Sem grupo' : 'Sem categoria');
      const color = projectItem?.color ?? categoryItem?.color ?? category?.color ?? 'var(--faint)';
      const groupId = `task-${groupBy}-${key}`;
      const itemsId = `${groupId}-items`;
      const groupCollapsed = collapsedGroups.has(groupId);
      const toggleGroup = () => setCollapsedGroups((current) => { const next = new Set(current); next.has(groupId) ? next.delete(groupId) : next.add(groupId); return next; });
      return <section className={`task-category-group ${groupBy === 'project' ? 'task-project-group' : ''} ${projectItem || categoryItem ? '' : 'uncategorized'} ${groupCollapsed ? 'is-collapsed' : ''}`} key={key} style={{ '--category-color': color } as CSSProperties} aria-labelledby={groupId}>
        <header className="task-category-head">
          <button type="button" className="task-category-toggle" onClick={toggleGroup} aria-expanded={!groupCollapsed} aria-controls={itemsId}>
            <span className="task-category-icon" aria-hidden="true">{groupBy === 'project' ? <Layers3 /> : categoryItem?.icon || <Folder />}</span>
            <span className="task-category-title" id={groupId}>{title}</span>
            <span className="task-category-count">{amount} {amount === 1 ? 'tarefa' : 'tarefas'}</span>
            <ChevronDown className="task-category-chevron" aria-hidden="true" />
          </button>
          {projectItem && <button className="task-group-edit" onClick={() => onModal({ type: 'project', categoryId: projectItem.categoryId, id: projectItem.id })} aria-label={`Editar grupo ${projectItem.name}`}><Edit3 /></button>}
        </header>
        <div id={itemsId} className="task-category-items-shell" aria-hidden={groupCollapsed}><div className="task-category-items">{groupedTasks.map((task) => walk(task, 0))}</div></div>
      </section>;
    });
  };
  const filterDefaults = initialFilters;
  const activeFilterCount = (Object.keys(filters) as (keyof Filters)[]).filter((key) => key !== 'sort' && filters[key] !== filterDefaults[key]).length;
  return <>
    <PageHeader className={category ? '' : 'task-page-header'} title={category ? <span className="category-title">{copy.title}<button className="category-edit-icon" onClick={() => onModal({ type: 'category', id: category.id })} aria-label={`Editar categoria ${category.name}`} title="Editar categoria"><Edit3 /></button></span> : copy.title} actions={category ? <button className="button subtle category-new-group" onClick={() => onModal({ type: 'project', categoryId: category.id })}><Plus />Agrupar tarefas</button> : <button className={`button filter-toggle ${filtersOpen ? 'active' : ''}`} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><SlidersHorizontal />Filtrar{activeFilterCount > 0 && <b>{activeFilterCount}</b>}<ChevronDown /></button>} />
    <section className="panel task-list-panel">
      {view.key !== 'category' && filtersOpen && <div className="filter-bar advanced-filters task-list-filters">
        <select aria-label="Ordenar tarefas" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value as SortMode })}><option value="manual">Ordem manual</option><option value="priority">Por prioridade</option><option value="deadline">Por prazo</option><option value="duration">Por duração</option><option value="title">Por nome</option></select>
        <select aria-label="Filtrar prioridade" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="all">Todas as prioridades</option><option value="1">P1 — urgente</option><option value="2">P2 — alta</option><option value="3">P3 — média</option><option value="4">P4 — baixa</option><option value="none">Sem prioridade</option></select>
        <select aria-label="Filtrar categoria" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="all">Todas as categorias</option><option value="none">Sem categoria</option>{state.categories.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select aria-label="Filtrar prazo" value={filters.deadline} onChange={(event) => setFilters({ ...filters, deadline: event.target.value })}><option value="all">Qualquer prazo</option><option value="none">Sem prazo</option><option value="overdue">Prazo ultrapassado</option><option value="today">Prazo hoje</option><option value="week">Próximos 7 dias</option></select>
        <select aria-label="Filtrar planeamento" value={filters.planning} onChange={(event) => setFilters({ ...filters, planning: event.target.value })}><option value="all">Qualquer planeamento</option><option value="none">Sem sessões</option><option value="today">Planeada hoje</option><option value="past">Planeamento ultrapassado</option></select>
        <button className="button small subtle" onClick={() => setFilters(filterDefaults)}>Limpar</button>
      </div>}
      <div ref={listBodyRef} className="panel-body task-list-body">{filtered.length ? renderTree(filtered, view.key === 'category' ? 'project' : 'category') : <div className="empty-state"><span>✓</span><h3>Nada por aqui</h3><p>Nenhuma tarefa corresponde aos filtros atuais.</p></div>}</div>
    </section>
  </>;
}
