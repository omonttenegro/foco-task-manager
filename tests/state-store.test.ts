import { beforeEach, describe, expect, it } from 'vitest';
import { StateStore } from '../server/state-store';

describe('StateStore para Netlify', () => {
  let store: StateStore;

  beforeEach(() => { store = new StateStore(); });

  it('mantém as regras de listas, tarefas e subtarefas', () => {
    const category = store.category({ name: 'Trabalho', color: '#ff4fa3' });
    const parent = store.task({ title: 'Publicar aplicação', categoryId: category.id });
    const child = store.task({ title: 'Testar produção', parentTaskId: parent.id });

    expect(child.categoryId).toBe(category.id);
    expect(() => store.task({ parentTaskId: child.id }, parent.id)).toThrow(/circular/i);
    expect(() => store.task({ status: 'done' }, parent.id)).toThrow(/subtarefas/i);
  });

  it('protege dependências contra ciclos', () => {
    const first = store.task({ title: 'Primeira' });
    const second = store.task({ title: 'Segunda' });
    store.dependency({ taskId: second.id, dependsOnTaskId: first.id });

    expect(() => store.dependency({ taskId: first.id, dependsOnTaskId: second.id })).toThrow(/circular/i);
  });

  it('remove relações dependentes como a base SQLite', () => {
    const parent = store.task({ title: 'Principal' });
    const child = store.task({ title: 'Passo', parentTaskId: parent.id });
    store.session({ taskId: parent.id, plannedDate: '2030-04-12', plannedDuration: 30 });

    store.remove('tasks', parent.id);
    const state = store.list();
    expect(state.tasks.find((item) => item.id === child.id)?.parentTaskId).toBeNull();
    expect(state.sessions).toHaveLength(0);
  });

  it('exporta e restaura o estado completo', () => {
    const task = store.task({ title: 'Continua na cloud', priority: 1 });
    const backup = store.export();
    store.task({ title: 'Será substituída' });

    const restored = store.import(backup);
    expect(restored.tasks).toHaveLength(1);
    expect(restored.tasks[0].id).toBe(task.id);
  });

  it('não permite que consumidores alterem o estado persistido por referência', () => {
    store.task({ title: 'Original' });
    const snapshot = store.list();
    snapshot.tasks[0].title = 'Alterado fora do store';

    expect(store.list().tasks[0].title).toBe('Original');
  });

  it('guarda a cor escolhida nas definições', () => {
    store.settings({ accent: 'emerald' });
    expect(store.list().settings.accent).toBe('emerald');
  });

  it('arruma automaticamente um grupo temporário quando termina a última tarefa', () => {
    const category = store.category({ name: 'Faculdade', color: '#ef2b87' });
    const first = store.task({ title: 'Rever matéria', categoryId: category.id });
    const second = store.task({ title: 'Fazer teste', categoryId: category.id });
    const project = store.project({ name: 'Teste de Contabilidade', categoryId: category.id, taskIds: [first.id, second.id] });

    expect(store.list().tasks.filter((task) => task.projectId === project.id)).toHaveLength(2);
    store.task({ status: 'done' }, first.id);
    expect(store.list().projects.find((item) => item.id === project.id)?.archived).toBe(false);

    store.task({ status: 'done' }, second.id);
    expect(store.list().projects.find((item) => item.id === project.id)?.archived).toBe(true);
    expect(store.list().tasks.find((task) => task.id === second.id)?.projectId).toBe(project.id);

    store.task({ status: 'todo' }, second.id);
    expect(store.list().projects.find((item) => item.id === project.id)?.archived).toBe(false);
  });
});
