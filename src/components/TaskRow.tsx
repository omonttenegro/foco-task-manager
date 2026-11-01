import { Check, ChevronDown, ChevronRight, Clock3, Flag, Folder, GripVertical, Layers3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppState, Task } from '../../shared/types';
import { categoryOf, childrenOf, formatDuration, projectOf, taskProgress } from '../lib/domain';
import { dayLabel, today } from '../lib/dates';
import { launchCompletionConfetti } from '../lib/completionConfetti';
import { useApp } from '../context/AppContext';

export function TaskRow({ state, task, onOpen, depth = 0, tree = false, collapsed = false, onCollapse, onBeforeDepart, sessionMinutes, draggable = false, showCategory = true, context }: {
  state: AppState; task: Task; onOpen: (id: string) => void; depth?: number; tree?: boolean; collapsed?: boolean; onCollapse?: () => void; onBeforeDepart?: (height: number) => void; sessionMinutes?: number; draggable?: boolean; showCategory?: boolean; context?: 'deadline-unplanned';
}) {
  const { mutate, notify } = useApp();
  const [celebrating, setCelebrating] = useState(false);
  const [departing, setDeparting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [toggling, setToggling] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const children = childrenOf(state, task.id);
  const progress = taskProgress(state, task);
  const category = categoryOf(state, task);
  const project = projectOf(state, task);
  const overdue = task.deadline && task.deadline < today() && task.status !== 'done';
  useEffect(() => setReopening(false), [task.status]);
  const toggle = async () => {
    if (toggling) return;
    const completing = task.status !== 'done';
    const finishesProject = completing && !task.parentTaskId && project && !state.tasks.some((item) => item.id !== task.id
      && item.projectId === project.id
      && item.parentTaskId === null
      && item.status !== 'done'
      && !item.archived);
    const openChildren = children.filter((child) => child.status !== 'done');
    let forceComplete = false;
    if (completing && openChildren.length) {
      forceComplete = window.confirm(`Existem ${openChildren.length} subtarefas por concluir. Ao concluir a tarefa principal, toda a família sai das vistas ativas e vai para o histórico, mas os checks das subtarefas mantêm-se como estão. Queres continuar?`);
      if (!forceComplete) return;
    }
    if (!completing) setReopening(true);
    setToggling(true);
    if (completing) {
      setCelebrating(true);
      navigator.vibrate?.([12, 48, 24]);
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      if (!task.parentTaskId) {
        const target = rowRef.current?.closest('.task-tree-node') ?? rowRef.current;
        const rect = target?.getBoundingClientRect();
        if (rect) launchCompletionConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
        setDeparting(true);
        await new Promise((resolve) => window.setTimeout(resolve, 560));
        navigator.vibrate?.([18, 34, 28, 42, 36]);
        await new Promise((resolve) => window.setTimeout(resolve, 390));
        const departingNode = rowRef.current?.closest<HTMLElement>('.task-tree-node') ?? rowRef.current;
        if (departingNode) onBeforeDepart?.(departingNode.offsetHeight);
      }
    }
    const result = await mutate(`/api/tasks/${task.id}`, 'PATCH', { status: completing ? 'done' : 'todo', forceComplete }, { silent: true });
    if (result && finishesProject) notify(`“${project.name}” concluído e arrumado no Histórico.`);
    if (!completing && !result) setReopening(false);
    if (completing && result && task.parentTaskId) window.setTimeout(() => setCelebrating(false), 520);
    else setCelebrating(false);
    setDeparting(false);
    setToggling(false);
  };
  const visuallyDone = (task.status === 'done' && !reopening) || celebrating;
  const deadlineUnplanned = context === 'deadline-unplanned';
  const hasMeta = Boolean(project || showCategory || task.deadline || children.length > 0 || sessionMinutes != null || task.estimatedDuration != null || deadlineUnplanned);
  return <><div ref={rowRef} className={`task-row ${deadlineUnplanned ? 'deadline-unplanned' : ''} ${celebrating ? 'completion-celebration' : ''} ${departing ? 'task-departing' : ''}`} style={{ paddingLeft: 12 + depth * 22 }} draggable={draggable} data-task-id={task.id}>
    {draggable && <GripVertical className="drag-handle" aria-hidden="true" />}
    <button className={`task-check ${visuallyDone ? 'checked' : ''} ${celebrating ? 'completing' : ''}`} disabled={toggling} onClick={() => void toggle()} aria-label={`${visuallyDone ? 'Reabrir' : 'Concluir'} ${task.title}`} aria-pressed={visuallyDone}>
      {visuallyDone && <Check className="task-check-mark" />}
      {celebrating && <span className="completion-burst" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</span>}
    </button>
    <button className="task-main" onClick={() => onOpen(task.id)}>
      <span className={`task-title ${visuallyDone && !celebrating ? 'done' : ''} ${celebrating ? 'completing' : ''}`}>{task.title}</span>
      {hasMeta && <span className="task-meta">
        {deadlineUnplanned && <span className="task-context-tag"><Flag />Prazo hoje</span>}
        {project && <span className="task-project-meta"><Layers3 />{project.name}</span>}
        {showCategory && <span>{category ? <><i style={{ background: category.color }} />{category.name}</> : 'Sem categoria'}</span>}
        {task.deadline && !deadlineUnplanned && <span className={overdue ? 'danger-text' : ''}><Flag />{dayLabel(task.deadline)}</span>}
        {children.length > 0 && <span><Folder />{progress.done}/{progress.total}</span>}
        {(sessionMinutes != null || task.estimatedDuration != null) && <span><Clock3 />{formatDuration(sessionMinutes ?? task.estimatedDuration)}</span>}
      </span>}
    </button>
    {task.priority && <span className={`priority priority-${task.priority}`}>P{task.priority}</span>}
    {tree && children.length > 0 ? <button className="tree-button" onClick={onCollapse} aria-label={`${collapsed ? 'Expandir' : 'Recolher'} subtarefas de ${task.title}`} aria-expanded={!collapsed}>{collapsed ? <ChevronRight /> : <ChevronDown />}</button> : null}
  </div></>;
}
