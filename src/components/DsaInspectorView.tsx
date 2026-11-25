import { ArrowRight, Binary, GitBranch, Hash, Layers } from 'lucide-react';
import { HospitalSnapshot } from '../types';
import { PriorityText, formatClock } from './PriorityBadge';

interface DsaInspectorViewProps {
  snapshot: HospitalSnapshot;
}

const COMPLEXITY_ROWS = [
  {
    structure: 'Min-Heap Priority Queue',
    role: 'Orders Emergency patients (P1–P3) by severity & arrival',
    operations: 'insert() / extractMin() / updatePriority()',
    time: 'O(log N) · peek O(1)',
    space: 'O(N)',
  },
  {
    structure: 'Hash Map (Separate Chaining)',
    role: 'O(1) patient/doctor lookup & live heap index tracking',
    operations: 'set() / get() / delete() / indexLookup()',
    time: 'O(1) average',
    space: 'O(N + B)',
  },
  {
    structure: 'FIFO Queue (Singly Linked)',
    role: 'Standard Walk-In (P4) first-come, first-served intake',
    operations: 'enqueue() / dequeue() / peek()',
    time: 'O(1)',
    space: 'O(N)',
  },
  {
    structure: 'Doubly Linked List',
    role: 'Chronological clinical audit & patient treatment timeline',
    operations: 'append() / reverseTraverse()',
    time: 'O(1) append · O(N) scan',
    space: 'O(N)',
  },
];

export function DsaInspectorView({ snapshot }: DsaInspectorViewProps) {
  const { heapArray, lastHeapTrace, fifoOrder, patientHashMap, linkedListLength } =
    snapshot.dsaInspection;

  // Group Min-Heap array into binary tree levels (0, 1, 2...) for level-order visualization
  const treeLevels: Array<typeof heapArray> = [];
  let start = 0;
  let count = 1;
  while (start < heapArray.length) {
    treeLevels.push(heapArray.slice(start, start + count));
    start += count;
    count *= 2;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Live Data Structures &amp; Complexity Inspector
        </h2>
        <p className="text-xs text-slate-500">
          Real-time state of the server-side Min-Heap, Hash Map, FIFO Queue, and Doubly Linked List
        </p>
      </div>

      {/* Min-Heap Binary Tree & Contiguous Array */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Binary className="w-4 h-4 text-teal-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                1. Binary Min-Heap Priority Queue ({heapArray.length} nodes)
              </h3>
              <p className="text-xs text-slate-500">
                Parent invariant: heap[floor((i-1)/2)] &le; heap[i] · Root index 0 is always extracted next
              </p>
            </div>
          </div>
          <span className="font-mono tabular-nums text-xs text-slate-600">
            Parent: ⌊(i-1)/2⌋ · Left: 2i+1 · Right: 2i+2
          </span>
        </div>

        <div className="p-5 space-y-6">
          {heapArray.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              Emergency Min-Heap is empty. Register a P1–P3 patient to observe heap insertion.
            </p>
          ) : (
            <>
              {/* Level-by-level binary tree view */}
              <div className="space-y-4">
                {treeLevels.map((level, depth) => (
                  <div key={depth} className="space-y-1.5">
                    <div className="text-[11px] font-mono text-slate-400">Depth {depth}</div>
                    <div className="flex flex-wrap gap-3">
                      {level.map((node) => (
                        <div
                          key={node.patientId}
                          className={`px-3.5 py-2.5 rounded-lg border min-w-[200px] ${
                            node.index === 0
                              ? 'bg-teal-50/60 border-teal-300'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-600">
                              idx[{node.index}]
                            </span>
                            <PriorityText priority={node.priority} />
                          </div>
                          <div className="mt-1 text-sm font-medium text-slate-900 truncate">
                            {node.name}
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500">
                            {node.mrn} · P:{node.parentIndex ?? '-'} L:{node.leftChildIndex ?? '-'} R:
                            {node.rightChildIndex ?? '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Last Heap Operation Trace */}
              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-slate-900">
                  Latest Heap Operation Execution Trace
                </h4>
                {lastHeapTrace ? (
                  <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="font-mono font-semibold text-slate-900">
                        {lastHeapTrace.operation}: {lastHeapTrace.targetLabel}
                      </div>
                      <div className="font-mono tabular-nums text-slate-600">
                        {lastHeapTrace.comparisons} comparisons · {lastHeapTrace.swaps.length} swaps ·{' '}
                        {lastHeapTrace.complexity}
                      </div>
                    </div>
                    {lastHeapTrace.swaps.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Heap property satisfied immediately — 0 swaps required.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-xs font-mono text-slate-700">
                        {lastHeapTrace.swaps.map((s, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="text-teal-700">
                              [{s.fromIndex} -&gt; {s.toIndex}]
                            </span>
                            <span>{s.description}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Perform a registration, priority escalation, or dispatch to inspect live heapify swaps.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* FIFO Queue + Doubly Linked List Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                2. Singly-Linked FIFO Queue ({fifoOrder.length} waiting)
              </h3>
              <p className="text-xs text-slate-500">
                O(1) enqueue/dequeue for P4 Walk-In cases · Promoted to Heap on escalation
              </p>
            </div>
          </div>
          <div className="p-5">
            {fifoOrder.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                FIFO Walk-In Queue is currently empty.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {fifoOrder.map((node, idx) => (
                  <div key={node.patientId} className="flex items-center gap-2">
                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                      <div className="text-[11px] font-mono tabular-nums text-slate-500">
                        {idx === 0 ? 'HEAD · ' : ''}#{node.position} · {node.mrn}
                      </div>
                      <div className="text-xs font-medium text-slate-900">{node.name}</div>
                    </div>
                    {idx < fifoOrder.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-teal-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                3. Doubly Linked List Audit Log ({linkedListLength} nodes)
              </h3>
              <p className="text-xs text-slate-500">
                O(1) append at tail · Reverse traversal (tail &rarr; prev) shows newest clinical events
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-200 max-h-64 overflow-y-auto">
            {snapshot.recentEvents.slice(0, 6).map((evt, idx) => (
              <div key={evt.id} className="px-5 py-3 text-xs">
                <div className="flex items-center justify-between gap-2 font-mono tabular-nums text-slate-500">
                  <span>
                    {idx === 0 ? 'TAIL · ' : ''}
                    {evt.mrn} · {evt.action}
                  </span>
                  <span>{formatClock(evt.timestamp)}</span>
                </div>
                <div className="mt-0.5 text-slate-800">{evt.detail}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Custom HashMap Bucket Distribution */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-teal-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                4. Custom Hash Map (Separate Chaining)
              </h3>
              <p className="text-xs text-slate-500">
                Polynomial string hash (djb2) with automatic rehashing at 0.75 load factor
              </p>
            </div>
          </div>
          <div className="font-mono tabular-nums text-xs text-slate-700 flex items-center gap-3">
            <span>Entries: {patientHashMap.size}</span>
            <span>Capacity: {patientHashMap.capacity}</span>
            <span>Load: {patientHashMap.loadFactor}</span>
            <span>Collisions: {patientHashMap.collisions}</span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 pl-5 pr-3">Bucket Index</th>
                <th className="py-2.5 px-3">Chain Length</th>
                <th className="py-2.5 pl-3 pr-5">Linked Bucket Entries (Key &rarr; Record)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {patientHashMap.nonEmptyBuckets.map((bucket) => (
                <tr key={bucket.bucketIndex}>
                  <td className="py-2.5 pl-5 pr-3 font-mono tabular-nums font-semibold text-slate-700">
                    bucket[{bucket.bucketIndex}]
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600">
                    {bucket.chain.length}
                  </td>
                  <td className="py-2.5 pl-3 pr-5 font-mono text-slate-800">
                    {bucket.chain.map((c) => `${c.key} (${c.summary})`).join(' -> ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Time & Space Complexity Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            DSA Time &amp; Space Complexity Summary
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 pl-5 pr-3">Data Structure</th>
                <th className="py-2.5 px-3">Clinical Responsibility</th>
                <th className="py-2.5 px-3">Core Operations</th>
                <th className="py-2.5 px-3">Time Complexity</th>
                <th className="py-2.5 pl-3 pr-5 text-right">Space</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {COMPLEXITY_ROWS.map((row) => (
                <tr key={row.structure}>
                  <td className="py-3 pl-5 pr-3 font-semibold text-slate-900">{row.structure}</td>
                  <td className="py-3 px-3 text-slate-600">{row.role}</td>
                  <td className="py-3 px-3 font-mono text-slate-700">{row.operations}</td>
                  <td className="py-3 px-3 font-mono tabular-nums font-medium text-teal-800">
                    {row.time}
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right font-mono tabular-nums text-slate-700">
                    {row.space}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
