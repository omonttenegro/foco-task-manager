import { closestCorners, DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, MouseSensor, pointerWithin, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent, type DropAnimation } from '@dnd-kit/core';
import { CalendarPlus2, ChevronLeft, ChevronRight, Clock3, Edit3, GripVertical, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppState, PlannedSession, Task } from '../../shared/types';
import type { ModalState } from '../components/AppDialogs';
import { PageHeader } from '../components/PageHeader';
import { useApp } from '../context/AppContext';
import { dayLabel, plusDays, today, weekStart } from '../lib/dates';
import { categoryOf, formatDuration, pendingTasks, projectOf, remainingMinutes, sessionsForDay, sortTasks } from '../lib/domain';

type PlannerDrag = {
  kind: 'task' | 'session';
  title: string;
  meta: string;
  color: string;
  width: number;
};

const taskScope = (state: AppState, task: Task) => {
  const category = categoryOf(state, task);
  const project = projectOf(state, task);
  return project ? `${category?.name ?? 'Sem categoria'} › ${project.name}` : category?.name ?? 'Sem categoria';
};

const planningCollisionDetection: CollisionDetection = (args) => {
  // Rato e toque só contam quando o cursor/dedo está realmente dentro do dia.
  // O fallback geométrico fica reservado ao teclado, que não tem coordenadas.
  if (args.pointerCoordinates) return pointerWithin(args);
  return closestCorners(args);
};

const plannerDropAnimation: DropAnimation = async ({ dragOverlay }) => {
  const node = dragOverlay.node;
  const currentTransform = window.getComputedStyle(node).transform;
  const transform = currentTransform === 'none' ? '' : currentTransform;
  const animation = node.animate([
    { opacity: 1, transform: `${transform} scale(1)` },
    { opacity: 0, transform: `${transform} scale(.9)`, filter: 'blur(1px)' },
  ], {
    duration: 190,
    easing: 'cubic-bezier(.2,.8,.2,1)',
    fill: 'forwards',
  });
  await animation.finished.catch(() => undefined);
};

export function PlanningPage({ state, onOpenTask, onModal }: { state: AppState; onOpenTask: (id: string) => void; onModal: (modal: ModalState) => void }) {
  const { mutate, notify } = useApp(); const [focusDate, setFocusDate] = useState(today()); const [activeDrag, setActiveDrag] = useState<PlannerDrag | null>(null); const [recentDrop, setRecentDrop] = useState<string | null>(null); const dropTimer = useRef<number | null>(null); const daysRef = useRef<HTMLDivElement>(null); const start = weekStart(focusDate, state.settings.weekStartsOn); const days = Array.from({ length: 7 }, (_, index) => plusDays(start, index));
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const pending = pendingTasks(state); const unplanned = sortTasks(pending.filter((task) => !state.sessions.some((session) => session.taskId === task.id)), 'priority'); const partial = sortTasks(pending.filter((task) => state.sessions.some((session) => session.taskId === task.id) && (remainingMinutes(state, task) ?? 0) > 0), 'priority');
  useEffect(() => () => { if (dropTimer.current != null) window.clearTimeout(dropTimer.current); }, []);
  useEffect(() => {
    const container = daysRef.current;
    const currentDay = container?.querySelector<HTMLElement>('.planning-day.today');
    if (!container || !currentDay) return;
    const frame = window.requestAnimationFrame(() => {
      if (container.scrollWidth <= container.clientWidth) return;
      const left = currentDay.offsetLeft - (container.clientWidth - currentDay.offsetWidth) / 2;
      container.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [start]);
  const markDrop = (date: string) => {
    setRecentDrop(date);
    if (dropTimer.current != null) window.clearTimeout(dropTimer.current);
    dropTimer.current = window.setTimeout(() => setRecentDrop(null), 620);
    navigator.vibrate?.([10, 24, 14]);
  };
  const onDragStart = ({ active }: DragStartEvent) => {
    const [kind, id] = String(active.id).split(':');
    const width = Math.min(Math.max(active.rect.current.initial?.width ?? 220, 180), 310);
    if (kind === 'task') {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) return;
      setActiveDrag({ kind, title: task.title, meta: `${taskScope(state, task)} · ${formatDuration(remainingMinutes(state, task) ?? task.estimatedDuration)}`, color: categoryOf(state, task)?.color ?? 'var(--primary)', width });
      return;
    }
    const session = state.sessions.find((item) => item.id === id);
    const task = session && state.tasks.find((item) => item.id === session.taskId);
    if (session && task) setActiveDrag({ kind: 'session', title: task.title, meta: `${taskScope(state, task)} · ${dayLabel(session.plannedDate, 'EEE, d MMM')} · ${formatDuration(session.plannedDuration)}`, color: categoryOf(state, task)?.color ?? 'var(--primary)', width });
  };
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveDrag(null);
    if (!over || !String(over.id).startsWith('day:')) return; const date = String(over.id).slice(4); const [kind, id] = String(active.id).split(':');
    markDrop(date);
    if (kind === 'task') { window.setTimeout(() => onModal({ type: 'plan', day: date, taskId: id }), 150); return; }
    if (await mutate(`/api/sessions/${id}`, 'PATCH', { plannedDate: date }, { silent: true })) notify('Sessão reagendada; o deadline não foi alterado.');
  };
  return <DndContext sensors={sensors} collisionDetection={planningCollisionDetection} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} autoScroll={{ acceleration: 10, interval: 8, threshold: { x: .16, y: .16 } }} onDragStart={onDragStart} onDragCancel={() => setActiveDrag(null)} onDragEnd={(event) => void onDragEnd(event)}>
    <PageHeader title="Planear" actions={<div className="planner-week-navigation"><div className="planner-week-stepper"><button className="button small" aria-label="Semana anterior" onClick={() => setFocusDate(plusDays(focusDate, -7))}><ChevronLeft /></button><button className="button small" aria-label="Semana seguinte" onClick={() => setFocusDate(plusDays(focusDate, 7))}><ChevronRight /></button></div><button className="button subtle planner-current-week" onClick={() => setFocusDate(today())}>Voltar a esta semana</button></div>} />
    <div className={`planner-layout ${activeDrag ? 'is-dragging' : ''}`}><aside className="planning-tray"><h2>Arrasta para planear <span>{unplanned.length}</span></h2>{unplanned.map((task) => <DraggableTask key={task.id} state={state} task={task} onOpen={() => onOpenTask(task.id)} />)}{!unplanned.length && <div className="empty-state compact"><span>✓</span><p>Todas as tarefas têm pelo menos uma sessão.</p></div>}{partial.length > 0 && <><h2 className="tray-section">Parcialmente alocadas <span>{partial.length}</span></h2>{partial.map((task) => <DraggableTask key={task.id} state={state} task={task} onOpen={() => onOpenTask(task.id)} partial />)}</>}</aside>
      <div ref={daysRef} className="planning-days">{days.map((date) => <PlanningDay key={date} state={state} date={date} onOpenTask={onOpenTask} onModal={onModal} dragKind={activeDrag?.kind} justDropped={recentDrop === date} />)}</div></div>
    <DragOverlay adjustScale={false} dropAnimation={plannerDropAnimation} zIndex={400}>
      {activeDrag && <div className={`planner-drag-overlay ${activeDrag.kind}`} style={{ width: activeDrag.width }}><span className="planner-drag-grip"><GripVertical /></span><span className="planner-drag-copy"><strong>{activeDrag.title}</strong><small><i style={{ background: activeDrag.color }} />{activeDrag.meta}</small></span><span className="planner-drag-action"><CalendarPlus2 />{activeDrag.kind === 'task' ? 'Planear' : 'Mover'}</span></div>}
    </DragOverlay>
  </DndContext>;
}

function DraggableTask({ state, task, onOpen, partial = false }: { state: AppState; task: Task; onOpen: () => void; partial?: boolean }) {
  const drag = useDraggable({ id: `task:${task.id}`, data: { taskId: task.id } });
  return <div ref={drag.setNodeRef} className={`tray-task drag-surface ${drag.isDragging ? 'dragging' : ''}`} {...drag.listeners}><button ref={drag.setActivatorNodeRef} className="drag-button" {...drag.attributes} aria-label={`Arrastar ${task.title}`}><GripVertical /></button><button className="tray-task-main" onClick={onOpen}><strong>{task.title}</strong><small>{partial ? `${taskScope(state, task)} · falta distribuir ${formatDuration(remainingMinutes(state, task))}` : `${taskScope(state, task)} · ${formatDuration(task.estimatedDuration)}`}</small></button></div>;
}

function PlanningDay({ state, date, onOpenTask, onModal, dragKind, justDropped }: { state: AppState; date: string; onOpenTask: (id: string) => void; onModal: (modal: ModalState) => void; dragKind?: PlannerDrag['kind']; justDropped: boolean }) {
  const { mutate } = useApp(); const drop = useDroppable({ id: `day:${date}` }); const sessions = sessionsForDay(state, date).filter((session) => state.tasks.find((task) => task.id === session.taskId)?.status !== 'done'); const total = sessions.reduce((sum, session) => sum + session.plannedDuration, 0); const overloaded = total > state.settings.dailyCapacityMinutes;
  return <section ref={drop.setNodeRef} className={`planning-day ${date === today() ? 'today' : ''} ${drop.isOver ? 'drop-active' : ''} ${justDropped ? 'just-dropped' : ''}`}><header><span>{dayLabel(date, 'EEE')}</span><strong>{dayLabel(date, 'd')}</strong><small className={overloaded ? 'danger-text' : ''}>{formatDuration(total)}{overloaded ? ' · acima do limite' : ''}</small></header><div className="day-sessions">{sessions.map((session) => <DraggableSession key={session.id} session={session} state={state} onOpenTask={onOpenTask} onEdit={() => onModal({ type: 'session', id: session.id })} onRemove={() => { if (window.confirm('Retirar esta sessão do planeamento?')) void mutate(`/api/sessions/${session.id}`, 'DELETE', undefined, { silent: true }); }} />)}</div><button className="button small add-session" onClick={() => onModal({ type: 'plan', day: date })}><Plus />Adicionar</button>{drop.isOver && <div className="planning-drop-cue" aria-hidden="true"><span><CalendarPlus2 /></span><strong>{dragKind === 'session' ? 'Solta para reagendar' : 'Solta para planear'}</strong></div>}</section>;
}

function DraggableSession({ state, session, onOpenTask, onEdit, onRemove }: { state: AppState; session: PlannedSession; onOpenTask: (id: string) => void; onEdit: () => void; onRemove: () => void }) {
  const drag = useDraggable({ id: `session:${session.id}`, data: { sessionId: session.id } }); const task = state.tasks.find((item) => item.id === session.taskId); if (!task) return null;
  return <article ref={drag.setNodeRef} className={`planned-card drag-surface ${drag.isDragging ? 'dragging' : ''}`} {...drag.listeners}><button ref={drag.setActivatorNodeRef} className="drag-button" {...drag.attributes} aria-label={`Reagendar ${task.title}`}><GripVertical /></button><button className="planned-main" onClick={() => onOpenTask(task.id)}><strong>{task.title}</strong><span className="planned-context">{projectOf(state, task)?.name ?? categoryOf(state, task)?.name ?? 'Sem categoria'}</span><small><Clock3 />{formatDuration(session.plannedDuration)}</small></button><div className="planned-actions"><button className="mini-icon" onClick={onEdit} aria-label="Editar sessão"><Edit3 /></button><button className="mini-icon danger-text" onClick={onRemove} aria-label="Retirar sessão"><X /></button></div></article>;
}
