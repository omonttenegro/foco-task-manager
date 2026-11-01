import { CalendarDays, Clock3, Flame, type LucideIcon } from 'lucide-react';
import type { AppState, Task } from '../../shared/types';
import { hasLatePlanning, isDeadlineOverdue, pendingTasks, sessionsForDay, sortTasks, uniqueTasksForSessions } from '../lib/domain';
import { today } from '../lib/dates';
import { PageHeader } from '../components/PageHeader';
import { TaskRow } from '../components/TaskRow';

type SectionVariant = 'today' | 'late' | 'urgent';

const sectionDetails: Record<SectionVariant, { icon: LucideIcon }> = {
  today: { icon: CalendarDays },
  late: { icon: Clock3 },
  urgent: { icon: Flame }
};

function TaskSection({ title, tasks, state, onOpenTask, empty, sessionDay, variant }: {
  title: string; tasks: Task[]; state: AppState; onOpenTask: (id: string) => void;
  empty: string; sessionDay?: string; variant: SectionVariant;
}) {
  const details = sectionDetails[variant];
  const Icon = details.icon;
  return <section className={`calm-section section-${variant} ${tasks.length ? 'has-items' : 'is-empty'}`}>
    <header className="calm-section-head">
      <div className="calm-section-title"><h2>{title}</h2><span>{tasks.length}</span></div>
      <span className="section-icon" aria-hidden="true"><Icon /></span>
    </header>
    <div className="calm-section-body">{tasks.length ? tasks.slice(0, 5).map((task) => {
      const taskSessions = sessionDay ? sessionsForDay(state, sessionDay).filter((session) => session.taskId === task.id) : [];
      const sessionMinutes = taskSessions.length ? taskSessions.reduce((sum, session) => sum + session.plannedDuration, 0) : undefined;
      const deadlineWithoutPlan = Boolean(sessionDay && task.deadline === sessionDay && taskSessions.length === 0);
      return <TaskRow key={task.id} state={state} task={task} onOpen={onOpenTask} sessionMinutes={sessionMinutes} context={deadlineWithoutPlan ? 'deadline-unplanned' : undefined} />;
    }) : <div className="quiet-empty" aria-label={empty}><Icon aria-hidden="true" /><strong>0</strong></div>}</div>
  </section>;
}

export function OverviewPage({ state, onOpenTask }: { state: AppState; onOpenTask: (id: string) => void }) {
  const day = today();
  const pending = pendingTasks(state);
  const todaySessions = sessionsForDay(state, day).filter((session) => state.tasks.find((task) => task.id === session.taskId)?.status !== 'done');
  const plannedToday = uniqueTasksForSessions(state, todaySessions);
  const deadlineToday = pending.filter((task) => task.deadline === day);
  const todayTasks = [...new Map([...plannedToday, ...deadlineToday].map((task) => [task.id, task])).values()];
  const overdue = pending.filter((task) => isDeadlineOverdue(task, day));
  const planningLate = pending.filter((task) => hasLatePlanning(state, task, day));
  const late = sortTasks([...new Map([...overdue, ...planningLate].map((task) => [task.id, task])).values()], 'priority');
  const lateIds = new Set(late.map((task) => task.id));
  const urgent = sortTasks(pending.filter((task) => (task.priority === 1 || task.priority === 2) && !lateIds.has(task.id)), 'priority');
  const formattedWeekday = new Intl.DateTimeFormat('pt-PT', { weekday: 'long' }).format(new Date());
  const weekday = formattedWeekday.charAt(0).toLocaleUpperCase('pt-PT') + formattedWeekday.slice(1);
  const calendarDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long' }).format(new Date());
  return <>
    <PageHeader title={<span className="overview-date"><span>{weekday}</span><span>{calendarDate}</span></span>} />
    <div className="home-summary" aria-label="Resumo do trabalho">
      <span><strong>{todayTasks.length}</strong> tarefas hoje</span>
      <span><strong>{late.length}</strong> atrasadas</span>
      <span><strong>{urgent.length}</strong> urgentes</span>
    </div>
    <div className="daily-focus-board">
      <TaskSection title="Hoje" tasks={todayTasks} state={state} onOpenTask={onOpenTask} empty="O dia está livre" sessionDay={day} variant="today" />
      <TaskSection title="Atrasadas" tasks={late} state={state} onOpenTask={onOpenTask} empty="Sem tarefas atrasadas" variant="late" />
      <TaskSection title="Urgentes" tasks={urgent} state={state} onOpenTask={onOpenTask} empty="Sem tarefas urgentes" variant="urgent" />
    </div>
  </>;
}
