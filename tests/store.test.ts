import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/database';
import { Store } from '../server/store';

describe('Store', () => {
  let store: Store;
  beforeEach(() => { store = new Store(openDatabase(':memory:')); });
  afterEach(() => store.close());

  it('cria categorias, projetos e tarefas mantendo a categoria do projeto', () => {
    const category = store.category({ name: 'Trabalho', color: '#6658e8' });
    const project = store.project({ name: 'Website', categoryId: category.id });
    const task = store.task({ title: 'Preparar conteúdo', projectId: project.id });

    expect(task.categoryId).toBe(category.id);
    expect(task.projectId).toBe(project.id);
    expect(store.list().tasks).toHaveLength(1);
  });

  it('rejeita incoerência entre projeto e categoria', () => {
    const work = store.category({ name: 'Trabalho', color: '#6658e8' });
    const personal = store.category({ name: 'Pessoal', color: '#188c63' });
    const project = store.project({ name: 'Website', categoryId: work.id });

    expect(() => store.task({ title: 'Tarefa impossível', categoryId: personal.id, projectId: project.id })).toThrow(/outra categoria/i);
  });

  it('impede dependências circulares sem limitar a conclusão', () => {
    const first = store.task({ title: 'Primeira' });
    const second = store.task({ title: 'Segunda' });
    store.dependency({ taskId: second.id, dependsOnTaskId: first.id });

    expect(() => store.dependency({ taskId: first.id, dependsOnTaskId: second.id })).toThrow(/circular/i);
    expect(store.task({ status: 'done' }, second.id).status).toBe('done');
  });

  it('protege hierarquias e exige confirmação para concluir um pai', () => {
    const parent = store.task({ title: 'Tarefa principal' });
    const child = store.task({ title: 'Passo', parentTaskId: parent.id });

    expect(() => store.task({ parentTaskId: child.id }, parent.id)).toThrow(/circular/i);
    expect(() => store.task({ status: 'done' }, parent.id)).toThrow(/subtarefas/i);
    expect(store.task({ status: 'done', forceComplete: true }, parent.id).status).toBe('done');
    expect(store.list().tasks.find((item) => item.id === child.id)?.status).toBe('todo');
  });

  it('mantém sessões planeadas independentes do deadline', () => {
    const task = store.task({ title: 'Preparar relatório', deadline: '2030-02-10', estimatedDuration: 120 });
    const session = store.session({ taskId: task.id, plannedDate: '2030-02-02', plannedDuration: 45 });
    store.session({ plannedDate: '2030-02-03' }, session.id);

    const state = store.list();
    expect(state.tasks[0].deadline).toBe('2030-02-10');
    expect(state.sessions[0].plannedDate).toBe('2030-02-03');
    expect(state.sessions[0].plannedDuration).toBe(45);
  });

  it('exporta e importa um backup completo de forma transacional', () => {
    const category = store.category({ name: 'Estudos', color: '#316ed0', icon: '📚' });
    const project = store.project({ name: 'Curso', categoryId: category.id, description: 'Formação' });
    const parent = store.task({ title: 'Módulo 1', projectId: project.id, estimatedDuration: 90 });
    const child = store.task({ title: 'Exercício', parentTaskId: parent.id });
    store.session({ taskId: child.id, plannedDate: '2030-04-12', plannedDuration: 30 });
    const backup = store.export();

    store.task({ title: 'Dado que será substituído' });
    const restored = store.import(backup);
    expect(restored.categories[0].name).toBe('Estudos');
    expect(restored.tasks).toHaveLength(2);
    expect(restored.tasks.find((item) => item.id === child.id)?.parentTaskId).toBe(parent.id);
    expect(restored.sessions).toHaveLength(1);
  });

  it('preserva os dados depois de fechar e reabrir a base de dados', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foco-persistence-'));
    const filename = path.join(directory, 'test.sqlite');
    const first = new Store(openDatabase(filename));
    first.task({ title: 'Continua aqui amanhã' });
    first.close();
    const second = new Store(openDatabase(filename));
    expect(second.list().tasks[0].title).toBe('Continua aqui amanhã');
    second.close();
    fs.rmSync(directory, { recursive: true });
  });

  it('preserva a cor da aplicação depois de reabrir a base de dados', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foco-colour-persistence-'));
    const filename = path.join(directory, 'test.sqlite');
    const first = new Store(openDatabase(filename));
    first.settings({ accent: 'blue' });
    first.close();
    const second = new Store(openDatabase(filename));
    expect(second.list().settings.accent).toBe('blue');
    second.close();
    fs.rmSync(directory, { recursive: true });
  });

  it('cria grupos com tarefas e arquiva-os automaticamente no fim', () => {
    const category = store.category({ name: 'Faculdade', color: '#ef2b87' });
    const first = store.task({ title: 'Aula 1', categoryId: category.id });
    const second = store.task({ title: 'Teste 2025', categoryId: category.id });
    const project = store.project({ name: 'Teste de Contabilidade', categoryId: category.id, taskIds: [first.id, second.id] });

    expect(store.list().tasks.every((task) => task.projectId === project.id)).toBe(true);
    store.task({ status: 'done' }, first.id);
    expect(store.list().projects[0].archived).toBe(false);
    store.task({ status: 'done' }, second.id);
    expect(store.list().projects[0].archived).toBe(true);
    expect(store.list().tasks[1].projectId).toBe(project.id);
  });
});
