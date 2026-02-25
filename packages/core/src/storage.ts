// =============================================================================
// Storage Adapter — pluggable persistence for all PaySentry components
// Default: in-memory. Swap for SQLite/Redis/Postgres in production.
// =============================================================================

/**
 * Filter options for listing stored items.
 */
export interface StorageFilter {
  /** Only items with keys starting with this prefix */
  readonly prefix?: string;
  /** Cursor-based pagination: return items after this key */
  readonly after?: string;
  /** Maximum number of items to return */
  readonly limit?: number;
  /** Sort direction by key */
  readonly sort?: 'asc' | 'desc';
}

/**
 * Pluggable storage backend. Every PaySentry component accepts this
 * interface in its constructor. Default is MemoryStorage.
 */
export interface StorageAdapter {
  get<T>(collection: string, key: string): T | undefined;
  set<T>(collection: string, key: string, value: T): void;
  delete(collection: string, key: string): boolean;
  list<T>(collection: string, filter?: StorageFilter): T[];
  count(collection: string): number;
  clear(collection: string): void;
}

/**
 * In-memory storage adapter. Fast, no dependencies, no persistence.
 * This is the default for all PaySentry components.
 */
export class MemoryStorage implements StorageAdapter {
  private readonly collections = new Map<string, Map<string, unknown>>();

  private getCollection(name: string): Map<string, unknown> {
    let col = this.collections.get(name);
    if (!col) {
      col = new Map();
      this.collections.set(name, col);
    }
    return col;
  }

  get<T>(collection: string, key: string): T | undefined {
    return this.getCollection(collection).get(key) as T | undefined;
  }

  set<T>(collection: string, key: string, value: T): void {
    this.getCollection(collection).set(key, value);
  }

  delete(collection: string, key: string): boolean {
    return this.getCollection(collection).delete(key);
  }

  list<T>(collection: string, filter?: StorageFilter): T[] {
    const col = this.getCollection(collection);
    let entries = Array.from(col.entries());

    if (filter?.prefix) {
      const p = filter.prefix;
      entries = entries.filter(([k]) => k.startsWith(p));
    }

    if (filter?.after) {
      const afterKey = filter.after;
      const idx = entries.findIndex(([k]) => k === afterKey);
      if (idx >= 0) entries = entries.slice(idx + 1);
    }

    if (filter?.sort === 'desc') {
      entries.reverse();
    }

    if (filter?.limit && filter.limit > 0) {
      entries = entries.slice(0, filter.limit);
    }

    return entries.map(([, v]) => v as T);
  }

  count(collection: string): number {
    return this.getCollection(collection).size;
  }

  clear(collection: string): void {
    this.collections.delete(collection);
  }
}
