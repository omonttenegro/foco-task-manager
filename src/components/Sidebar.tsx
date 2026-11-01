import { Asterisk, CalendarDays, CircleCheckBig, Clock3, History, ListTodo, PanelLeftClose, Plus, Settings, Sun } from 'lucide-react';
import type { AppState } from '../../shared/types';
import { countWorkItems, pendingTasks } from '../lib/domain';
import type { View } from '../App';
import { useAuth } from '../context/AuthContext';

const primaryNav = [
  ['overview', Sun, 'Hoje'], ['inbox', ListTodo, 'Tarefas'],
  ['planning', Clock3, 'Planear'], ['calendar', CalendarDays, 'Agenda']
] as const;

export function Sidebar({ state, view, open, onClose, navigate, onNewCategory, onSettings, onProfile }: {
  state: AppState; view: View; open: boolean; onClose: () => void; navigate: (view: View) => void; onNewCategory: () => void; onSettings: () => void; onProfile: () => void;
}) {
  const { user } = useAuth();
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const profileName = String(user?.user_metadata.full_name ?? '').trim() || user?.email?.split('@')[0] || 'Perfil';
  const initials = profileName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  const pending = pendingTasks(state);
  const count = (key: string) => {
    if (key === 'inbox') return countWorkItems(state, pending);
    return null;
  };
  const go = (target: View) => { navigate(target); onClose(); };
  return <>
    {open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={onClose} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark" aria-hidden="true"><Asterisk /></div><div><strong>foco<span>.</span></strong></div><button className="icon-button sidebar-close" onClick={onClose} aria-label="Fechar menu"><PanelLeftClose /></button></div>
      <nav className="sidebar-scroll" aria-label="Navegação principal">
        <div className="nav-label">PRINCIPAL</div>
        {primaryNav.map(([key, Icon, label]) => {
          const value = count(key);
          const active = view.key === key;
          return <button key={key} className={`sidebar-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => go({ key })}><Icon /><span>{label}</span>{value != null && <span className="count">{value}</span>}</button>;
        })}
        <div className="nav-label">CATEGORIAS</div>
        {state.categories.filter((category) => !category.archived).map((category) => {
          const amount = countWorkItems(state, pending.filter((task) => task.categoryId === category.id));
          const active = view.key === 'category' && view.id === category.id;
          return <button key={category.id} className={`sidebar-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => go({ key: 'category', id: category.id })}><span className="nav-dot" style={{ background: category.color }} />{category.icon && <span>{category.icon}</span>}<span>{category.name}</span><span className="count">{amount}</span></button>;
        })}
        <button className="sidebar-link quiet-link" onClick={onNewCategory}><Plus /><span>Nova categoria</span></button>
        <div className="sidebar-scroll-end"><button className={`sidebar-link ${view.key === 'archive' ? 'active' : ''}`} aria-current={view.key === 'archive' ? 'page' : undefined} onClick={() => go({ key: 'archive' })}><History /><span>Histórico</span></button></div>
      </nav>
      <div className="sidebar-foot"><div className="sidebar-account-row"><button className="sidebar-profile" onClick={onProfile}><span className="profile-avatar">{initials}</span><span><strong>{profileName}</strong><small>{user?.email}</small></span></button><button className="sidebar-settings" onClick={onSettings} aria-label="Definições" title="Definições"><Settings /></button></div><div className="local-tag"><CircleCheckBig /> {isLocal ? 'Sessão de desenvolvimento' : 'Dados privados na cloud'}</div></div>
    </aside>
  </>;
}
