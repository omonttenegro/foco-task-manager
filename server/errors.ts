export class AppError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'AppError';
  }
}

export const assert: (condition: unknown, message: string, status?: number) => asserts condition = (condition, message, status = 400) => {
  if (!condition) throw new AppError(message, status);
};
