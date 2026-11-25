/**
 * Custom Singly-Linked FIFO Queue for Standard (P4) Walk-In Triage Intake.
 * Time Complexity:
 *  - enqueue(): O(1)
 *  - dequeue(): O(1)
 *  - peek(): O(1)
 *  - removeById(): O(N) (used when a P4 patient is escalated into the Emergency Min-Heap)
 * Space Complexity: O(N)
 */

interface QueueNode<T> {
  value: T;
  next: QueueNode<T> | null;
}

export class FifoQueue<T extends { patientId: string }> {
  private head: QueueNode<T> | null = null;
  private tail: QueueNode<T> | null = null;
  private count = 0;

  enqueue(value: T): void {
    const node: QueueNode<T> = { value: { ...value }, next: null };
    if (this.tail === null) {
      this.head = node;
      this.tail = node;
    } else {
      this.tail.next = node;
      this.tail = node;
    }
    this.count++;
  }

  dequeue(): T | null {
    if (this.head === null) return null;
    const removed = this.head.value;
    this.head = this.head.next;
    if (this.head === null) {
      this.tail = null;
    }
    this.count--;
    return removed;
  }

  peek(): T | null {
    return this.head ? { ...this.head.value } : null;
  }

  removeById(patientId: string): T | null {
    let current = this.head;
    let prev: QueueNode<T> | null = null;

    while (current !== null) {
      if (current.value.patientId === patientId) {
        if (prev === null) {
          this.head = current.next;
        } else {
          prev.next = current.next;
        }
        if (current === this.tail) {
          this.tail = prev;
        }
        this.count--;
        return current.value;
      }
      prev = current;
      current = current.next;
    }
    return null;
  }

  has(patientId: string): boolean {
    let current = this.head;
    while (current !== null) {
      if (current.value.patientId === patientId) return true;
      current = current.next;
    }
    return false;
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.head = null;
    this.tail = null;
    this.count = 0;
  }

  toArray(): T[] {
    const result: T[] = [];
    let current = this.head;
    while (current !== null) {
      result.push({ ...current.value });
      current = current.next;
    }
    return result;
  }
}
