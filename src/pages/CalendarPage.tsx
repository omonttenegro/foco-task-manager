import { ChevronLeft, ChevronRight, Flag, Plus } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppState, CalendarView, PlannedSession, Task } from '../../shared/types';
import type { ModalState } from '../components/AppDialogs';
import { PageHeader } from '../components/PageHeader';
import { useApp } from '../context/AppContext';
import { dayLabel, monthCalendarDays, moveMonth, plusDays, today, weekStart } from '../lib/dates';
import { activeTasks, categoryOf, formatDuration, isVisibleInActiveTree, projectOf, sessionsForDay } from '../lib/domain';

type CalendarReveal = {
  date: string;
  source: { left: number; top: number; width: number; height: number };
  target: { left: number; top: number; width: number; height: number };
};

export function CalendarPage({ state, onOpenTask, onModal }: { state: AppState; onOpenTask: (id: string) => void; onModal: (modal: ModalState) => void }) {
  const { mutate } = useApp(); const [focus, setFocus] = useState(today()); const [view, setView] = useState<CalendarView>(state.settings.preferredCalendarView); const [openingDay, setOpeningDay] = useState<CalendarReveal | null>(null); const [expandedDayHeight, setExpandedDayHeight] = useState<number>();
  const openingDayLock = useRef(false);
  const visible = (task: Task) => task.status !== 'done' && isVisibleInActiveTree(state, task);
  const change = (amount: number) => setFocus(view === 'month' ? moveMonth(focus, amount) : plusDays(focus, amount * (view === 'week' ? 7 : 1)));
  const openDay = (date: string) => {
    // State is only committed on the next render. Lock synchronously so a
    // second tap cannot start another reveal in that small window.
    if (openingDayLock.current) return;
    openingDayLock.current = true;
    const source = document.querySelector<HTMLElement>(`.calendar-cell[data-calendar-date="${date}"]`);
    const month = source?.closest<HTMLElement>('.month-view');
    if (!source || !month) {
      setFocus(date);
      setView('day');
      setExpandedDayHeight(undefined);
      openingDayLock.current = false;
      return;
    }
    const sourceBounds = source.getBoundingClientRect();
    const targetBounds = month.getBoundingClientRect();
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    source.classList.add('calendar-transition-source');
    setOpeningDay({
      date,
      source: { left: sourceBounds.left + pageX, top: sourceBounds.top + pageY, width: sourceBounds.width, height: sourceBounds.height },
      target: { left: targetBounds.left + pageX, top: targetBounds.top + pageY, width: targetBounds.width, height: targetBounds.height },
    });
  };
  const finishOpeningDay = (finalHeight: number) => {
    if (!openingDay) return;
    document.querySelector<HTMLElement>(`.calendar-cell[data-calendar-date="${openingDay.date}"]`)?.classList.remove('calendar-transition-source');
    setFocus(openingDay.date);
    setView('day');
    setExpandedDayHeight(finalHeight);
    setOpeningDay(null);
    openingDayLock.current = false;
  };
  const displayedView: CalendarView = openingDay ? 'day' : view;
  const displayedFocus = openingDay?.date ?? focus;
  const title = displayedView === 'month' ? dayLabel(displayedFocus, 'MMMM yyyy') : displayedView === 'week' ? `${dayLabel(weekStart(displayedFocus, state.settings.weekStartsOn))} – ${dayLabel(plusDays(weekStart(displayedFocus, state.settings.weekStartsOn), 6))}` : dayLabel(displayedFocus, 'EEEE, d MMMM');
  return <div className={`calendar-page calendar-page-${view}`}><PageHeader title="Agenda" />
    <div className="calendar-controls"><strong>{title}</strong><div className="calendar-stepper"><button className="button small" onClick={() => { if (!openingDay) change(-1); }} aria-label="Período anterior"><ChevronLeft /></button><button className="button small" onClick={() => { if (!openingDay) change(1); }} aria-label="Período seguinte"><ChevronRight /></button></div><button className="button small calendar-today" onClick={() => { if (!openingDay) setFocus(today()); }}>Voltar a hoje</button><span /><div className="segments calendar-view-segments" role="group" aria-label="Vista da agenda" data-view={displayedView}><i className="calendar-view-indicator" aria-hidden="true" />{(['day','week','month'] as CalendarView[]).map((item) => <button key={item} className={displayedView === item ? 'active' : ''} aria-pressed={displayedView === item} onClick={() => { if (openingDay) return; setExpandedDayHeight(undefined); setView(item); void mutate('/api/settings', 'PATCH', { preferredCalendarView: item }, { silent: true }); }}>{item === 'day' ? 'Dia' : item === 'week' ? 'Semana' : 'Mês'}</button>)}</div></div>
    {view === 'month' ? <MonthView state={state} focus={focus} visible={visible} onOpenTask={onOpenTask} onDay={openDay} opening={Boolean(openingDay)} /> : <DaysView state={state} days={view === 'day' ? [focus] : Array.from({ length: 7 }, (_, index) => plusDays(weekStart(focus, state.settings.weekStartsOn), index))} visible={visible} onOpenTask={onOpenTask} onModal={onModal} expandedMinHeight={view === 'day' ? expandedDayHeight : undefined} />}
    {openingDay && <CalendarDayReveal state={state} reveal={openingDay} visible={visible} onComplete={finishOpeningDay} />}
  </div>;
}

function MonthView({ state, focus, visible, onOpenTask, onDay, opening }: { state: AppState; focus: string; visible: (task: Task) => boolean; onOpenTask: (id: string) => void; onDay: (date: string) => void; opening: boolean }) {
  const month = focus.slice(0, 7); const days = monthCalendarDays(focus, state.settings.weekStartsOn); const labels = state.settings.weekStartsOn === 1 ? ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'] : ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  return <div className={`month-view calendar-weeks-${days.length / 7} ${opening ? 'is-opening-day' : ''}`} aria-busy={opening}><div className="month-weekdays">{labels.map((label) => <div className="month-label" key={label}>{label}</div>)}</div><div className="month-grid">{days.map((date) => <CalendarCell key={date} state={state} date={date} outside={!date.startsWith(month)} visible={visible} onOpenTask={onOpenTask} onDay={onDay} disabled={opening} />)}</div></div>;
}

function CalendarCell({ state, date, outside, visible, onOpenTask, onDay, disabled }: { state: AppState; date: string; outside: boolean; visible: (task: Task) => boolean; onOpenTask: (id: string) => void; onDay: (date: string) => void; disabled: boolean }) {
  const sessions = sessionsForDay(state, date).filter((session) => { const task = state.tasks.find((item) => item.id === session.taskId); return task && visible(task); }); const deadlines = activeTasks(state).filter((task) => task.deadline === date && visible(task));
  const items = [
    ...sessions.flatMap((session) => { const task = state.tasks.find((item) => item.id === session.taskId); return task ? [{ kind: 'session' as const, session, task }] : []; }),
    ...deadlines.map((task) => ({ kind: 'deadline' as const, task })),
  ].sort((a, b) => (a.task.priority ?? Number.POSITIVE_INFINITY) - (b.task.priority ?? Number.POSITIVE_INFINITY) || a.task.title.localeCompare(b.task.title, 'pt'));
  const shownItems = items.slice(0, 2);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const weekend = weekday === 0 || weekday === 6;
  return <section data-calendar-date={date} className={`calendar-cell ${outside ? 'outside' : ''} ${weekend ? 'weekend' : ''} ${date === today() ? 'today' : ''}`}><button className="calendar-date" aria-label={dayLabel(date, 'EEEE, d MMMM')} disabled={disabled} onClick={() => onDay(date)}>{dayLabel(date, 'd')}</button><div className="calendar-cell-items">{shownItems.map((item) => item.kind === 'session' ? <CalendarSession key={`session-${item.session.id}`} state={state} session={item.session} onOpenTask={onOpenTask} /> : <button className="calendar-item deadline" key={`deadline-${item.task.id}`} aria-label={`Deadline: ${item.task.title}`} onClick={() => onOpenTask(item.task.id)}><Flag />{item.task.title}</button>)}</div>{items.length > 2 && <small className="calendar-more">+{items.length - 2} mais</small>}</section>;
}

function CalendarSession({ state, session, onOpenTask }: { state: AppState; session: PlannedSession; onOpenTask: (id: string) => void }) {
  const task = state.tasks.find((item) => item.id === session.taskId); if (!task) return null;
  const color = categoryOf(state, task)?.color ?? 'var(--primary)';
  return <button style={{ background: `color-mix(in srgb, ${color} 18%, var(--surface))`, color }} className={`calendar-item ${task.status === 'done' ? 'done' : ''}`} onClick={() => onOpenTask(task.id)}>{task.title}</button>;
}

function CalendarDayReveal({ state, reveal, visible, onComplete }: { state: AppState; reveal: CalendarReveal; visible: (task: Task) => boolean; onComplete: (finalHeight: number) => void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const sessions = sessionsForDay(state, reveal.date).filter((session) => { const task = state.tasks.find((item) => item.id === session.taskId); return task && visible(task); });
  const deadlines = activeTasks(state).filter((task) => task.deadline === reveal.date && visible(task));
  const total = sessions.reduce((sum, session) => sum + session.plannedDuration, 0);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    // Opening a day also changes the responsive controls above the calendar.
    // On narrow screens that title can wrap, moving both the selected cell and
    // the month panel after the click-time measurements were taken. Measure the
    // live layout here, after React has committed those controls, so the reveal
    // starts and ends on the exact mobile positions without a finishing snap.
    const liveSource = document.querySelector<HTMLElement>(`.calendar-cell[data-calendar-date="${reveal.date}"]`);
    const liveMonth = liveSource?.closest<HTMLElement>('.month-view');
    const sourceBounds = liveSource?.getBoundingClientRect();
    const targetBounds = liveMonth?.getBoundingClientRect();
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    const source = sourceBounds
      ? { left: sourceBounds.left + pageX, top: sourceBounds.top + pageY, width: sourceBounds.width, height: sourceBounds.height }
      : reveal.source;
    const target = targetBounds
      ? { left: targetBounds.left + pageX, top: targetBounds.top + pageY, width: targetBounds.width, height: targetBounds.height }
      : reveal.target;
    layer.style.left = `${target.left}px`;
    layer.style.top = `${target.top}px`;
    layer.style.width = `${target.width}px`;
    const dayColumn = layer.querySelector<HTMLElement>('.calendar-day-column');
    const finalHeight = Math.max(target.height, dayColumn?.scrollHeight ?? 0);
    layer.style.height = `${finalHeight}px`;
    if (dayColumn) dayColumn.style.minHeight = `${finalHeight}px`;
    const translateX = source.left - target.left;
    const translateY = source.top - target.top;
    const scaleX = source.width / target.width;
    const scaleY = source.height / finalHeight;
    let active = true;
    const animation = layer.animate([
      { transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})` },
      { transform: 'translate(0, 0) scale(1, 1)' },
    ], { duration: 720, easing: 'cubic-bezier(.18,.86,.24,1)', fill: 'both' });
    animation.onfinish = () => { if (active) onComplete(finalHeight); };
    return () => { active = false; animation.cancel(); };
  }, [onComplete, reveal]);

  return createPortal(<div ref={layerRef} className="calendar-day-reveal-layer" aria-hidden="true" style={{ left: reveal.target.left, top: reveal.target.top, width: reveal.target.width, height: reveal.target.height }}>
    <div className="calendar-days single expanded-from-month">
      <section className={`calendar-day-column ${reveal.date === today() ? 'today' : ''}`} style={{ minHeight: reveal.target.height }}>
        <header><span>{dayLabel(reveal.date, 'EEEE')}</span><strong>{dayLabel(reveal.date, 'd')}</strong><small className={total > state.settings.dailyCapacityMinutes ? 'danger-text' : ''}>{formatDuration(total)} planeado</small></header>
        {sessions.map((session) => { const task = state.tasks.find((item) => item.id === session.taskId); return task ? <button type="button" tabIndex={-1} className="calendar-session-card" key={session.id}><i style={{ background: categoryOf(state, task)?.color ?? 'var(--primary)' }} /><strong>{task.title}</strong><span className="calendar-session-context">{projectOf(state, task)?.name ?? categoryOf(state, task)?.name ?? 'Sem categoria'}</span><small>{formatDuration(session.plannedDuration)}</small></button> : null; })}
        {deadlines.map((task) => <button type="button" tabIndex={-1} className="calendar-deadline-card" key={task.id}><Flag /><span><strong>{task.title}</strong><small>{projectOf(state, task)?.name ? `Deadline · ${projectOf(state, task)!.name}` : 'Deadline'}</small></span></button>)}
        <button type="button" tabIndex={-1} className="button small add-session"><Plus />Planear</button>
      </section>
    </div>
  </div>, document.body);
}

function DaysView({ state, days, visible, onOpenTask, onModal, expandedMinHeight }: { state: AppState; days: string[]; visible: (task: Task) => boolean; onOpenTask: (id: string) => void; onModal: (modal: ModalState) => void; expandedMinHeight?: number }) {
  const compact = days.length > 1;
  return <div className={`calendar-days ${compact ? 'week' : 'single'} ${expandedMinHeight ? 'expanded-from-month' : ''}`}>{days.map((date) => { const sessions = sessionsForDay(state, date).filter((session) => { const task = state.tasks.find((item) => item.id === session.taskId); return task && visible(task); }); const deadlines = activeTasks(state).filter((task) => task.deadline === date && visible(task)); const total = sessions.reduce((sum, session) => sum + session.plannedDuration, 0); return <DayColumn key={date} state={state} date={date} sessions={sessions} deadlines={deadlines} total={total} compact={compact} onOpenTask={onOpenTask} onModal={onModal} minHeight={expandedMinHeight} />; })}</div>;
}

function DayColumn({ state, date, sessions, deadlines, total, compact, onOpenTask, onModal, minHeight }: { state: AppState; date: string; sessions: PlannedSession[]; deadlines: Task[]; total: number; compact: boolean; onOpenTask: (id: string) => void; onModal: (modal: ModalState) => void; minHeight?: number }) {
  return <section style={minHeight ? { minHeight } : undefined} className={`calendar-day-column ${date === today() ? 'today' : ''}`}><header><span>{dayLabel(date, compact ? 'EEE' : 'EEEE')}</span><strong>{dayLabel(date, 'd')}</strong><small className={total > state.settings.dailyCapacityMinutes ? 'danger-text' : ''}>{formatDuration(total)}{compact ? '' : ' planeado'}</small></header>{sessions.map((session) => <CalendarSessionCard key={session.id} state={state} session={session} onOpenTask={onOpenTask} />)}{deadlines.map((task) => <button className="calendar-deadline-card" key={task.id} onClick={() => onOpenTask(task.id)}><Flag /><span><strong>{task.title}</strong><small>{projectOf(state, task)?.name ? `Deadline · ${projectOf(state, task)!.name}` : 'Deadline'}</small></span></button>)}<button className="button small add-session" onClick={() => onModal({ type: 'plan', day: date })}><Plus />Planear</button></section>;
}

function CalendarSessionCard({ state, session, onOpenTask }: { state: AppState; session: PlannedSession; onOpenTask: (id: string) => void }) {
  const task = state.tasks.find((item) => item.id === session.taskId);
  if (!task) return null;
  return <button className="calendar-session-card" onClick={() => onOpenTask(task.id)}><i style={{ background: categoryOf(state, task)?.color ?? 'var(--primary)' }} /><strong>{task.title}</strong><span className="calendar-session-context">{projectOf(state, task)?.name ?? categoryOf(state, task)?.name ?? 'Sem categoria'}</span><small>{formatDuration(session.plannedDuration)}</small></button>;
}
