import { vi } from 'vitest';

/**
 * Mock Firebase Database for testing
 * Simulates Firebase Realtime Database operations with controllable delays
 */
export class MockFirebaseDatabase {
  private data: Map<string, any> = new Map();
  private listeners: Map<string, Set<Function>> = new Map();
  public latency = 0; // Simulate network latency

  async get(path: string): Promise<any> {
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }
    return this.data.get(path);
  }

  async set(path: string, value: any): Promise<void> {
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }
    this.data.set(path, value);
    this.notifyListeners(path, value);
  }

  async update(path: string, updates: any): Promise<void> {
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }
    const current = this.data.get(path) || {};
    const updated = { ...current, ...updates };
    this.data.set(path, updated);
    this.notifyListeners(path, updated);
  }

  async remove(path: string): Promise<void> {
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }
    this.data.delete(path);
    this.notifyListeners(path, null);
  }

  on(path: string, callback: Function): void {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path)!.add(callback);

    // Immediately call with current value if exists
    const currentValue = this.data.get(path);
    if (currentValue !== undefined) {
      callback(currentValue);
    }
  }

  off(path: string, callback?: Function): void {
    if (!callback) {
      this.listeners.delete(path);
    } else {
      this.listeners.get(path)?.delete(callback);
    }
  }

  private notifyListeners(path: string, value: any): void {
    this.listeners.get(path)?.forEach(callback => callback(value));
  }

  clear(): void {
    this.data.clear();
    this.listeners.clear();
  }

  // Simulate race condition by delaying specific operations
  setOperationDelay(path: string, delay: number): void {
    const originalSet = this.set.bind(this);
    this.set = async (p: string, v: any) => {
      if (p === path) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return originalSet(p, v);
    };
  }
}

/**
 * Create mock Firebase app and database
 */
export function createMockFirebase() {
  const mockDb = new MockFirebaseDatabase();

  return {
    app: {
      name: 'test-app',
      options: {},
    },
    database: {
      ref: (path: string) => ({
        get: () => mockDb.get(path),
        set: (value: any) => mockDb.set(path, value),
        update: (updates: any) => mockDb.update(path, updates),
        remove: () => mockDb.remove(path),
        on: (event: string, callback: Function) => mockDb.on(path, callback),
        off: (event: string, callback?: Function) => mockDb.off(path, callback),
        push: () => {
          const key = `generated-key-${Date.now()}`;
          return {
            key,
            set: (value: any) => mockDb.set(`${path}/${key}`, value),
          };
        },
      }),
    },
    _mockDb: mockDb, // Expose for testing
  };
}
