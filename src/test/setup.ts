// src/test/setup.ts
//
// Minimal browser globals for the data-layer tests.
//
// The fallback backend stores everything in `localStorage`, and `isTauri()`
// asks `window`. Both are trivial to provide; pulling in jsdom for two
// objects would cost seconds per run and buy nothing else.

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  writable: true,
  configurable: true,
});

// `isTauri()` checks for a key on `window`; without it the data layer takes
// the in-memory path, which is exactly what these tests exercise.
if (!("window" in globalThis)) {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    writable: true,
    configurable: true,
  });
}
