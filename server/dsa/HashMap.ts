/**
 * Custom HashMap implementation using Separate Chaining (Linked Buckets)
 * Average Time Complexity:
 *  - set(key, value): O(1) amortized
 *  - get(key): O(1) average
 *  - delete(key): O(1) average
 *  - has(key): O(1) average
 * Space Complexity: O(N + B) where N = entries, B = bucket array capacity
 */

interface BucketNode<V> {
  key: string;
  value: V;
  next: BucketNode<V> | null;
}

export class CustomHashMap<V> {
  private buckets: Array<BucketNode<V> | null>;
  private count = 0;
  private capacity: number;
  private readonly maxLoadFactor = 0.75;

  constructor(initialCapacity = 16) {
    this.capacity = Math.max(8, initialCapacity);
    this.buckets = new Array<BucketNode<V> | null>(this.capacity).fill(null);
  }

  private hash(key: string): number {
    let hashVal = 5381;
    for (let i = 0; i < key.length; i++) {
      hashVal = ((hashVal << 5) + hashVal + key.charCodeAt(i)) >>> 0;
    }
    return hashVal % this.capacity;
  }

  private rehash(): void {
    const oldBuckets = this.buckets;
    this.capacity *= 2;
    this.buckets = new Array<BucketNode<V> | null>(this.capacity).fill(null);
    this.count = 0;

    for (let i = 0; i < oldBuckets.length; i++) {
      let node = oldBuckets[i];
      while (node !== null) {
        this.set(node.key, node.value);
        node = node.next;
      }
    }
  }

  set(key: string, value: V): void {
    if ((this.count + 1) / this.capacity > this.maxLoadFactor) {
      this.rehash();
    }

    const index = this.hash(key);
    let current = this.buckets[index];

    while (current !== null) {
      if (current.key === key) {
        current.value = value;
        return;
      }
      current = current.next;
    }

    const newNode: BucketNode<V> = {
      key,
      value,
      next: this.buckets[index],
    };
    this.buckets[index] = newNode;
    this.count++;
  }

  get(key: string): V | undefined {
    const index = this.hash(key);
    let current = this.buckets[index];
    while (current !== null) {
      if (current.key === key) {
        return current.value;
      }
      current = current.next;
    }
    return undefined;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    const index = this.hash(key);
    let current = this.buckets[index];
    let prev: BucketNode<V> | null = null;

    while (current !== null) {
      if (current.key === key) {
        if (prev === null) {
          this.buckets[index] = current.next;
        } else {
          prev.next = current.next;
        }
        this.count--;
        return true;
      }
      prev = current;
      current = current.next;
    }
    return false;
  }

  clear(): void {
    this.buckets = new Array<BucketNode<V> | null>(this.capacity).fill(null);
    this.count = 0;
  }

  size(): number {
    return this.count;
  }

  getCapacity(): number {
    return this.capacity;
  }

  values(): V[] {
    const result: V[] = [];
    for (let i = 0; i < this.buckets.length; i++) {
      let node = this.buckets[i];
      while (node !== null) {
        result.push(node.value);
        node = node.next;
      }
    }
    return result;
  }

  getStats(summarize: (val: V) => string): {
    size: number;
    capacity: number;
    loadFactor: number;
    collisions: number;
    nonEmptyBuckets: Array<{ bucketIndex: number; chain: Array<{ key: string; summary: string }> }>;
  } {
    let collisions = 0;
    const nonEmptyBuckets: Array<{
      bucketIndex: number;
      chain: Array<{ key: string; summary: string }>;
    }> = [];

    for (let i = 0; i < this.buckets.length; i++) {
      let node = this.buckets[i];
      if (node !== null) {
        const chain: Array<{ key: string; summary: string }> = [];
        while (node !== null) {
          chain.push({ key: node.key, summary: summarize(node.value) });
          node = node.next;
        }
        if (chain.length > 1) {
          collisions += chain.length - 1;
        }
        nonEmptyBuckets.push({ bucketIndex: i, chain });
      }
    }

    return {
      size: this.count,
      capacity: this.capacity,
      loadFactor: Number((this.count / this.capacity).toFixed(2)),
      collisions,
      nonEmptyBuckets,
    };
  }
}
