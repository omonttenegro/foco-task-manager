import type { ReactNode } from 'react';

export function PageHeader({ title, actions, className = '' }: { title: ReactNode; actions?: ReactNode; className?: string }) {
  return <header className={`page-header ${className}`.trim()}><div><h1>{title}</h1></div>{actions && <div className="page-actions">{actions}</div>}</header>;
}
