import { ArrowRight } from 'lucide-react';

export function QuickAdd({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className="quick-add quick-add-launch" onClick={onOpen}>
    <span className="quick-add-launch-accent" aria-hidden="true" />
    <span className="quick-add-launch-copy"><strong>Nova tarefa</strong><small>Adicionar detalhes e organização</small></span>
    <span className="quick-add-launch-arrow" aria-hidden="true"><ArrowRight /></span>
  </button>;
}
