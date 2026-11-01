import { AlertCircle, CalendarDays, Clock3, ListTodo, Menu, Plus, Search, Sun, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModalState } from './components/AppDialogs';
import { Sidebar } from './components/Sidebar';
import { useApp } from './context/AppContext';
import { OverviewPage } from './pages/OverviewPage';
import { applyTheme } from './lib/theme';

const PlanningPage = lazy(() => import('./pages/PlanningPage').then((module) => ({ default: module.PlanningPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((module) => ({ default: module.CalendarPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })));
const TaskListPage = lazy(() => import('./pages/TaskListPage').then((module) => ({ default: module.TaskListPage })));
const TaskDrawer = lazy(() => import('./components/TaskDrawer').then((module) => ({ default: module.TaskDrawer })));
const AppDialogs = lazy(() => import('./components/AppDialogs').then((module) => ({ default: module.AppDialogs })));

type ListViewKey = 'inbox' | 'today' | 'tomorrow' | 'upcoming' | 'unplanned' | 'archive' | 'high' | 'overdue' | 'plannedLate' | 'search';
export type View = { key: 'overview' | 'planning' | 'calendar' | ListViewKey } | { key: 'category'; id: string };

export function App() {
  const { state, loading, error, toast, refresh } = useApp();
  const [view, setView] = useState<View>({ key: 'overview' });
  const [selectedTask, setSelectedTask] = useState<string | 'new' | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileDockReady, setMobileDockReady] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileOverlayOpen = Boolean(selectedTask || modal || sidebarOpen || mobileSearchOpen);

  const navigate = useCallback((target: View) => {
    setView(target);
    if (target.key !== 'search') setSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [sidebarOpen]);

  useEffect(() => {
    if (mobileOverlayOpen) {
      setMobileDockReady(false);
      return;
    }

    const viewport = window.visualViewport;
    let settleTimer = window.setTimeout(() => setMobileDockReady(true), 180);
    const waitForViewport = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => setMobileDockReady(true), 100);
    };

    viewport?.addEventListener('resize', waitForViewport);
    viewport?.addEventListener('scroll', waitForViewport);
    window.addEventListener('orientationchange', waitForViewport);
    return () => {
      window.clearTimeout(settleTimer);
      viewport?.removeEventListener('resize', waitForViewport);
      viewport?.removeEventListener('scroll', waitForViewport);
      window.removeEventListener('orientationchange', waitForViewport);
    };
  }, [mobileOverlayOpen]);

  useEffect(() => {
    if (!state) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyTheme(state.settings.theme, state.settings.accent);
    const applyWhenVisible = () => { if (!document.hidden) apply(); };
    apply();
    media.addEventListener('change', apply);
    window.addEventListener('focus', apply);
    window.addEventListener('pageshow', apply);
    window.addEventListener('resize', apply);
    document.addEventListener('visibilitychange', applyWhenVisible);
    return () => {
      media.removeEventListener('change', apply);
      window.removeEventListener('focus', apply);
      window.removeEventListener('pageshow', apply);
      window.removeEventListener('resize', apply);
      document.removeEventListener('visibilitychange', applyWhenVisible);
    };
  }, [state?.settings.theme, state?.settings.accent]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'i') { event.preventDefault(); navigate({ key: 'inbox' }); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'h') { event.preventDefault(); navigate({ key: 'overview' }); }
      if (!typing && event.key.toLowerCase() === 'n') { event.preventDefault(); setSelectedTask('new'); }
      if (event.key === 'Escape' && !modal) { setSelectedTask(null); setSidebarOpen(false); }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [modal, navigate]);

  const drawerContext = useMemo(() => {
    if (!state) return undefined;
    if (view.key === 'category') return { categoryId: view.id };
    return undefined;
  }, [state, view]);

  if (loading) return <div className="app-state"><div className="loader" /><strong>A preparar o teu espaço…</strong><span>Os dados ficam protegidos no teu perfil.</span></div>;
  if (error || !state) return <div className="app-state error-state"><AlertCircle /><h1>Não foi possível abrir a aplicação</h1><p>{error ?? 'Não foi possível carregar os teus dados.'}</p><button className="button primary" onClick={() => void refresh()}>Tentar novamente</button></div>;

  const page = view.key === 'overview'
    ? <OverviewPage state={state} onOpenTask={setSelectedTask} />
    : view.key === 'planning'
      ? <PlanningPage state={state} onOpenTask={setSelectedTask} onModal={setModal} />
      : view.key === 'calendar'
        ? <CalendarPage state={state} onOpenTask={setSelectedTask} onModal={setModal} />
        : view.key === 'archive'
          ? <HistoryPage state={state} onOpenTask={setSelectedTask} />
        : <TaskListPage state={state} view={view} search={search} onOpenTask={setSelectedTask} onModal={setModal} />;

  return <div className="app-shell">
    <Sidebar state={state} view={view} open={sidebarOpen} onClose={() => setSidebarOpen(false)} navigate={navigate} onNewCategory={() => setModal({ type: 'category' })} onSettings={() => setModal({ type: 'settings' })} onProfile={() => setModal({ type: 'profile' })} />
    <div className="app-column">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu /></button>
        <span className="mobile-brand">foco<span>.</span></span>
        <label className={`global-search ${mobileSearchOpen ? 'mobile-visible' : ''}`}><Search /><span className="sr-only">Pesquisar tarefas</span><input ref={searchRef} value={search} onChange={(event) => { setSearch(event.target.value); if (event.target.value) setView({ key: 'search' }); }} placeholder="Pesquisar tarefas…" />{(search || mobileSearchOpen) && <button onClick={() => { setSearch(''); setMobileSearchOpen(false); if (view.key === 'search') navigate({ key: 'overview' }); }} aria-label="Fechar pesquisa"><X /></button>}<kbd>⌘ K</kbd></label>
        <button className="icon-button mobile-search-toggle" onClick={() => { setMobileSearchOpen(true); window.setTimeout(() => searchRef.current?.focus(), 30); }} aria-label="Pesquisar"><Search /></button>
        {view.key !== 'overview' && <button className="button primary new-task" onClick={() => setSelectedTask('new')} aria-label="Nova tarefa"><Plus /><span>Nova tarefa</span></button>}
      </header>
      <main className="main-content">
        <Suspense fallback={<div className="page-loading" role="status" aria-live="polite"><span className="loader" /><span className="sr-only">A abrir…</span></div>}>
          {page}
        </Suspense>
      </main>
    </div>
    {mobileDockReady && !mobileOverlayOpen && <nav className="mobile-dock" aria-label="Navegação móvel">
      <button className={view.key === 'overview' ? 'active' : ''} aria-current={view.key === 'overview' ? 'page' : undefined} onClick={() => navigate({ key: 'overview' })}><Sun /><span>Hoje</span></button>
      <button className={view.key === 'inbox' || view.key === 'category' || view.key === 'search' ? 'active' : ''} aria-current={view.key === 'inbox' || view.key === 'category' || view.key === 'search' ? 'page' : undefined} onClick={() => navigate({ key: 'inbox' })}><ListTodo /><span>Tarefas</span></button>
      <button className="mobile-create" onClick={() => setSelectedTask('new')} aria-label="Nova tarefa"><Plus /></button>
      <button className={view.key === 'planning' ? 'active' : ''} aria-current={view.key === 'planning' ? 'page' : undefined} onClick={() => navigate({ key: 'planning' })}><Clock3 /><span>Planear</span></button>
      <button className={view.key === 'calendar' ? 'active' : ''} aria-current={view.key === 'calendar' ? 'page' : undefined} onClick={() => navigate({ key: 'calendar' })}><CalendarDays /><span>Agenda</span></button>
    </nav>}
    {selectedTask && <Suspense fallback={null}><TaskDrawer selected={selectedTask} context={drawerContext} onClose={() => setSelectedTask(null)} onSelect={setSelectedTask} /></Suspense>}
    {modal && <Suspense fallback={null}><AppDialogs modal={modal} onClose={() => setModal(null)} onCreated={(kind, id, categoryId) => navigate({ key: 'category', id: kind === 'category' ? id : categoryId! })} /></Suspense>}
    {toast && <div className={`toast ${toast.kind}`} role="status"><b>{toast.kind === 'success' ? '✓' : '!'}</b><span>{toast.message}</span></div>}
  </div>;
}
