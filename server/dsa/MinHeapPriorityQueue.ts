import { HeapNodeView, HeapOperationTrace, HeapSwapStep, PriorityLevel } from '../../src/types.ts';
import { CustomHashMap } from './HashMap.ts';

/**
 * Binary Min-Heap Priority Queue with O(1) index lookup via CustomHashMap.
 * Ordering:
 *   1. Smaller numeric priority comes first (P1 Critical < P2 Emergent < P3 Urgent < P4 Standard).
 *   2. On equal priority, earlier arrival timestamp comes first (FIFO fairness).
 *
 * Time Complexity:
 *  - insert(): O(log N)
 *  - extractMin(): O(log N)
 *  - peek(): O(1)
 *  - updatePriority(): O(log N) (uses HashMap index lookup + heapifyUp/Down)
 *  - removeById(): O(log N)
 * Space Complexity: O(N)
 */

export interface TriageHeapEntry {
  patientId: string;
  mrn: string;
  name: string;
  priority: PriorityLevel;
  arrivedAt: number;
}

export class MinHeapPriorityQueue {
  private heap: TriageHeapEntry[] = [];
  private indexMap = new CustomHashMap<number>(32);
  private lastTrace: HeapOperationTrace | null = null;

  private isHigherPriority(a: TriageHeapEntry, b: TriageHeapEntry): boolean {
    if (a.priority !== b.priority) {
      return a.priority < b.priority;
    }
    return a.arrivedAt < b.arrivedAt;
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
    this.indexMap.set(this.heap[i].patientId, i);
    this.indexMap.set(this.heap[j].patientId, j);
  }

  private heapifyUp(startIndex: number, swaps: HeapSwapStep[]): number {
    let idx = startIndex;
    let comparisons = 0;

    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      comparisons++;
      if (this.isHigherPriority(this.heap[idx], this.heap[parentIdx])) {
        swaps.push({
          fromIndex: idx,
          toIndex: parentIdx,
          direction: 'up',
          description: `Swapped ${this.heap[idx].mrn} (P${this.heap[idx].priority}) up with parent ${this.heap[parentIdx].mrn} (P${this.heap[parentIdx].priority})`,
        });
        this.swap(idx, parentIdx);
        idx = parentIdx;
      } else {
        break;
      }
    }
    return comparisons;
  }

  private heapifyDown(startIndex: number, swaps: HeapSwapStep[]): number {
    let idx = startIndex;
    let comparisons = 0;
    const len = this.heap.length;

    while (true) {
      const leftIdx = 2 * idx + 1;
      const rightIdx = 2 * idx + 2;
      let smallest = idx;

      if (leftIdx < len) {
        comparisons++;
        if (this.isHigherPriority(this.heap[leftIdx], this.heap[smallest])) {
          smallest = leftIdx;
        }
      }

      if (rightIdx < len) {
        comparisons++;
        if (this.isHigherPriority(this.heap[rightIdx], this.heap[smallest])) {
          smallest = rightIdx;
        }
      }

      if (smallest !== idx) {
        swaps.push({
          fromIndex: idx,
          toIndex: smallest,
          direction: 'down',
          description: `Sunk ${this.heap[idx].mrn} (P${this.heap[idx].priority}) down with child ${this.heap[smallest].mrn} (P${this.heap[smallest].priority})`,
        });
        this.swap(idx, smallest);
        idx = smallest;
      } else {
        break;
      }
    }
    return comparisons;
  }

  insert(entry: TriageHeapEntry, recordTrace = true): void {
    const existingIdx = this.indexMap.get(entry.patientId);
    if (existingIdx !== undefined) {
      this.updatePriority(entry.patientId, entry.priority, recordTrace);
      return;
    }

    this.heap.push({ ...entry });
    const insertIdx = this.heap.length - 1;
    this.indexMap.set(entry.patientId, insertIdx);

    const swaps: HeapSwapStep[] = [];
    const comparisons = this.heapifyUp(insertIdx, swaps);

    if (recordTrace) {
      this.lastTrace = {
        operation: 'INSERT',
        targetLabel: `${entry.name} (${entry.mrn}, P${entry.priority})`,
        timestamp: Date.now(),
        comparisons,
        swaps,
        complexity: 'O(log N)',
      };
    }
  }

  peek(): TriageHeapEntry | null {
    return this.heap.length > 0 ? { ...this.heap[0] } : null;
  }

  extractMin(recordTrace = true): TriageHeapEntry | null {
    if (this.heap.length === 0) return null;

    const min = { ...this.heap[0] };
    this.indexMap.delete(min.patientId);

    const swaps: HeapSwapStep[] = [];
    let comparisons = 0;

    if (this.heap.length === 1) {
      this.heap.pop();
    } else {
      const last = this.heap.pop()!;
      this.heap[0] = last;
      this.indexMap.set(last.patientId, 0);
      swaps.push({
        fromIndex: this.heap.length,
        toIndex: 0,
        direction: 'extract',
        description: `Moved tail ${last.mrn} (P${last.priority}) to root index 0 before heapifyDown`,
      });
      comparisons = this.heapifyDown(0, swaps);
    }

    if (recordTrace) {
      this.lastTrace = {
        operation: 'EXTRACT_MIN',
        targetLabel: `${min.name} (${min.mrn}, P${min.priority})`,
        timestamp: Date.now(),
        comparisons,
        swaps,
        complexity: 'O(log N)',
      };
    }

    return min;
  }

  updatePriority(patientId: string, newPriority: PriorityLevel, recordTrace = true): boolean {
    const idx = this.indexMap.get(patientId);
    if (idx === undefined) return false;

    const oldPriority = this.heap[idx].priority;
    this.heap[idx].priority = newPriority;

    const swaps: HeapSwapStep[] = [];
    let comparisons = 0;

    if (newPriority < oldPriority) {
      comparisons = this.heapifyUp(idx, swaps);
    } else if (newPriority > oldPriority) {
      comparisons = this.heapifyDown(idx, swaps);
    }

    if (recordTrace) {
      this.lastTrace = {
        operation: 'UPDATE_PRIORITY',
        targetLabel: `${this.heap[this.indexMap.get(patientId) ?? idx]?.name ?? patientId} (P${oldPriority} -> P${newPriority})`,
        timestamp: Date.now(),
        comparisons,
        swaps,
        complexity: 'O(log N)',
      };
    }

    return true;
  }

  removeById(patientId: string, recordTrace = true): TriageHeapEntry | null {
    const idx = this.indexMap.get(patientId);
    if (idx === undefined) return null;

    const removed = { ...this.heap[idx] };
    this.indexMap.delete(patientId);

    const swaps: HeapSwapStep[] = [];
    let comparisons = 0;

    const lastIdx = this.heap.length - 1;
    if (idx === lastIdx) {
      this.heap.pop();
    } else {
      const replacement = this.heap.pop()!;
      this.heap[idx] = replacement;
      this.indexMap.set(replacement.patientId, idx);
      comparisons += this.heapifyUp(idx, swaps);
      const currentIdx = this.indexMap.get(replacement.patientId) ?? idx;
      comparisons += this.heapifyDown(currentIdx, swaps);
    }

    if (recordTrace) {
      this.lastTrace = {
        operation: 'REMOVE',
        targetLabel: `${removed.name} (${removed.mrn})`,
        timestamp: Date.now(),
        comparisons,
        swaps,
        complexity: 'O(log N)',
      };
    }

    return removed;
  }

  has(patientId: string): boolean {
    return this.indexMap.has(patientId);
  }

  size(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap = [];
    this.indexMap.clear();
    this.lastTrace = null;
  }

  toSortedArray(): TriageHeapEntry[] {
    const clone = new MinHeapPriorityQueue();
    clone.heap = this.heap.map((item) => ({ ...item }));
    for (let i = 0; i < clone.heap.length; i++) {
      clone.indexMap.set(clone.heap[i].patientId, i);
    }
    const sorted: TriageHeapEntry[] = [];
    while (clone.size() > 0) {
      const next = clone.extractMin(false);
      if (next) sorted.push(next);
    }
    return sorted;
  }

  getHeapArrayView(): HeapNodeView[] {
    return this.heap.map((node, index) => ({
      index,
      patientId: node.patientId,
      mrn: node.mrn,
      name: node.name,
      priority: node.priority,
      arrivedAt: node.arrivedAt,
      parentIndex: index === 0 ? null : Math.floor((index - 1) / 2),
      leftChildIndex: 2 * index + 1 < this.heap.length ? 2 * index + 1 : null,
      rightChildIndex: 2 * index + 2 < this.heap.length ? 2 * index + 2 : null,
    }));
  }

  getLastTrace(): HeapOperationTrace | null {
    return this.lastTrace;
  }
}
