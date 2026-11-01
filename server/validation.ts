import { z } from 'zod';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: string) => {
  if (!isoDate.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export const idSchema = z.string().uuid();
export const nullableId = idSchema.nullable();
export const colorSchema = z.string().regex(/^#[\da-f]{6}$/i, 'Usa uma cor no formato #RRGGBB.');
export const dateSchema = z.string().refine(validDay, 'Data inválida.');
export const durationSchema = z.number().int().min(0).max(200_000);

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: colorSchema,
  icon: z.string().max(30).nullable(),
  archived: z.boolean()
});

export const projectSchema = z.object({
  categoryId: idSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(10_000),
  color: colorSchema.nullable(),
  archived: z.boolean()
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'O título é obrigatório.').max(300),
  description: z.string().max(30_000),
  categoryId: nullableId,
  projectId: nullableId,
  parentTaskId: nullableId,
  status: z.enum(['todo', 'progress', 'done']),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  deadline: dateSchema.nullable(),
  estimatedDuration: durationSchema.nullable(),
  archived: z.boolean(),
  position: z.number().int()
});

export const sessionSchema = z.object({
  taskId: idSchema,
  plannedDate: dateSchema,
  plannedDuration: durationSchema,
  completedDuration: durationSchema.nullable(),
  status: z.enum(['planned', 'done']),
  position: z.number().int()
});

export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  accent: z.enum(['pink', 'blue', 'violet', 'emerald']).default('pink'),
  preferredCalendarView: z.enum(['month', 'week', 'day']),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  dailyCapacityMinutes: z.number().int().min(0).max(1440)
});

export function validationMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Dados inválidos.';
  return 'Dados inválidos.';
}
