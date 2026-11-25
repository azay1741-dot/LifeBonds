/**
 * Custom Doubly Linked List for chronological Patient Treatment & Audit History.
 * Time Complexity:
 *  - append(): O(1)
 *  - toArrayNewestFirst(): O(N) via tail -> prev traversal
 *  - filterByPatient(): O(N)
 * Space Complexity: O(N)
 */

interface DoublyNode<T> {
  data: T;
  prev: DoublyNode<T> | null;
  next: DoublyNode<T> | null;
}

export class DoublyLinkedList<T extends { patientId?: string }> {
  private head: DoublyNode<T> | null = null;
  private tail: DoublyNode<T> | null = null;
  private count = 0;

  append(data: T): void {
    const node: DoublyNode<T> = {
      data: { ...data },
      prev: this.tail,
      next: null,
    };

    if (this.tail === null) {
      this.head = node;
      this.tail = node;
    } else {
      this.tail.next = node;
      this.tail = node;
    }
    this.count++;
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.head = null;
    this.tail = null;
    this.count = 0;
  }

  toArrayNewestFirst(limit?: number): T[] {
    const result: T[] = [];
    let current = this.tail;
    while (current !== null) {
      result.push({ ...current.data });
      if (limit !== undefined && result.length >= limit) {
        break;
      }
      current = current.prev;
    }
    return result;
  }

  filterByPatient(patientId: string): T[] {
    const result: T[] = [];
    let current = this.tail;
    while (current !== null) {
      if (current.data.patientId === patientId) {
        result.push({ ...current.data });
      }
      current = current.prev;
    }
    return result;
  }
}
