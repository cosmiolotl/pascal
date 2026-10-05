export class KeyedQueue {
  readonly #pending = new Map<string, Promise<unknown>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#pending.get(key) ?? Promise.resolve();
    const current = previous.then(task, task);
    const settled = current.catch(() => undefined);
    this.#pending.set(key, settled);
    try {
      return await current;
    } finally {
      if (this.#pending.get(key) === settled) this.#pending.delete(key);
    }
  }
}
