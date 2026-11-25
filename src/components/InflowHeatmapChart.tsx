import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { HourlyInflowBucket } from '../types';

interface InflowHeatmapChartProps {
  buckets: HourlyInflowBucket[];
}

interface HeatmapCellDatum {
  hourIndex: number;
  tierIndex: number;
  count: number;
  hourLabel: string;
  tierLabel: string;
  totalInHour: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
}

const TIER_ROWS: Array<{
  tierIndex: number;
  key: 'p4' | 'p3' | 'p2' | 'p1';
  axisLabel: string;
  fullLabel: string;
}> = [
  { tierIndex: 0, key: 'p4', axisLabel: 'P4 Standard', fullLabel: 'P4 Standard (FIFO)' },
  { tierIndex: 1, key: 'p3', axisLabel: 'P3 Urgent', fullLabel: 'P3 Urgent' },
  { tierIndex: 2, key: 'p2', axisLabel: 'P2 Emergent', fullLabel: 'P2 Emergent' },
  { tierIndex: 3, key: 'p1', axisLabel: 'P1 Critical', fullLabel: 'P1 Critical' },
];

const CHART_MARGIN = { top: 10, right: 14, bottom: 26, left: 88 };
const CHART_HEIGHT = 216;

function getHeatStyle(count: number, tierIndex: number): {
  fill: string;
  stroke: string;
  text: string;
} {
  if (count === 0) {
    return { fill: '#F8FAFC', stroke: '#E2E8F0', text: '#94A3B8' };
  }
  if (tierIndex === 3 && count >= 2) {
    return { fill: '#DC2626', stroke: '#B91C1C', text: '#FFFFFF' };
  }
  if (count >= 3) {
    return { fill: '#DC2626', stroke: '#B91C1C', text: '#FFFFFF' };
  }
  if (count === 2) {
    return { fill: '#0F766E', stroke: '#0D9488', text: '#FFFFFF' };
  }
  return { fill: '#99F6E4', stroke: '#5EEAD4', text: '#115E59' };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: HeatmapCellDatum }>;
}

function HeatmapTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) {
    return null;
  }
  const cell = payload[0].payload;
  const nextHourNum = (Number(cell.hourLabel.slice(0, 2)) + 1) % 24;
  const windowEnd = `${String(nextHourNum).padStart(2, '0')}:00`;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs space-y-1.5">
      <div className="font-mono tabular-nums font-semibold text-slate-900">
        {cell.hourLabel} – {windowEnd}
      </div>
      <div className="text-slate-700">
        <span className="font-medium">{cell.tierLabel}:</span>{' '}
        <span className="font-mono tabular-nums font-semibold text-slate-900">
          {cell.count} {cell.count === 1 ? 'patient' : 'patients'}
        </span>
      </div>
      <div className="pt-1 border-t border-slate-100 font-mono tabular-nums text-[11px] text-slate-500 flex items-center gap-2">
        <span>Hour Total: {cell.totalInHour}</span>
        <span>·</span>
        <span>
          P1:{cell.p1} P2:{cell.p2} P3:{cell.p3} P4:{cell.p4}
        </span>
      </div>
    </div>
  );
}

export function InflowHeatmapChart({ buckets }: InflowHeatmapChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(860);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setChartWidth(el.clientWidth);
      }
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { cells, total24h, peakBucket, activeHoursCount } = useMemo(() => {
    const cellList: HeatmapCellDatum[] = [];
    let total = 0;
    let peak: HourlyInflowBucket | null = null;
    let activeHours = 0;

    for (const b of buckets) {
      total += b.total;
      if (b.total > 0) activeHours += 1;
      if (!peak || b.total > peak.total) {
        peak = b;
      }
      for (const row of TIER_ROWS) {
        cellList.push({
          hourIndex: b.hourIndex,
          tierIndex: row.tierIndex,
          count: b[row.key],
          hourLabel: b.label,
          tierLabel: row.fullLabel,
          totalInHour: b.total,
          p1: b.p1,
          p2: b.p2,
          p3: b.p3,
          p4: b.p4,
        });
      }
    }

    return {
      cells: cellList,
      total24h: total,
      peakBucket: peak,
      activeHoursCount: activeHours,
    };
  }, [buckets]);

  const hourByIndex = useMemo(() => {
    const map = new Map<number, string>();
    for (const b of buckets) {
      map.set(b.hourIndex, b.label);
    }
    return map;
  }, [buckets]);

  const plotWidth = Math.max(240, chartWidth - CHART_MARGIN.left - CHART_MARGIN.right);
  const cellWidth = Math.max(10, Math.floor(plotWidth / 24) - 4);
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const cellHeight = Math.max(22, Math.floor(plotHeight / 4) - 6);

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            24-Hour Patient Inflow Heat Map (Hourly Peak Load)
          </h3>
          <p className="text-xs text-slate-500">
            Arrival frequency by hour and triage severity over the last 24 hours ·{' '}
            <span className="font-mono tabular-nums text-slate-700">{total24h} total arrivals</span>
            {peakBucket && peakBucket.total > 0 && (
              <>
                {' '}
                · Peak load at{' '}
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {peakBucket.label} ({peakBucket.total} patients)
                </span>
              </>
            )}
            {' '}
            ·{' '}
            <span className="font-mono tabular-nums text-slate-600">
              {activeHoursCount}/24 active hours
            </span>
          </p>
        </div>

        {/* Heat Scale Legend */}
        <div className="flex items-center gap-2 text-[11px] text-slate-500 shrink-0">
          <span>Load:</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded-xs bg-slate-50 border border-slate-200" />
            <span className="font-mono tabular-nums">0</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded-xs bg-[#99F6E4] border border-[#5EEAD4]" />
            <span className="font-mono tabular-nums">1</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded-xs bg-[#0F766E]" />
            <span className="font-mono tabular-nums">2</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded-xs bg-[#DC2626]" />
            <span className="font-mono tabular-nums">3+ / Surge</span>
          </span>
        </div>
      </div>

      <div ref={containerRef} className="px-4 pt-3 pb-4 w-full">
        <div style={{ width: '100%', height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={CHART_MARGIN}>
              <XAxis
                type="number"
                dataKey="hourIndex"
                domain={[-0.5, 23.5]}
                ticks={[0, 3, 6, 9, 12, 15, 18, 21, 23]}
                tickFormatter={(val: number) => hourByIndex.get(val) ?? ''}
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono, monospace' }}
              />
              <YAxis
                type="number"
                dataKey="tierIndex"
                domain={[-0.5, 3.5]}
                ticks={[0, 1, 2, 3]}
                width={84}
                tickFormatter={(val: number) =>
                  TIER_ROWS.find((r) => r.tierIndex === val)?.axisLabel ?? ''
                }
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#334155', fontWeight: 500 }}
              />
              <ZAxis type="number" dataKey="count" range={[0, 10]} />
              <Tooltip
                cursor={false}
                content={<HeatmapTooltip />}
                isAnimationActive={false}
              />
              <Scatter
                data={cells}
                isAnimationActive={false}
                shape={(rawProps: unknown) => {
                  const props = rawProps as {
                    cx?: number;
                    cy?: number;
                    payload?: HeatmapCellDatum;
                  };
                  if (
                    typeof props.cx !== 'number' ||
                    typeof props.cy !== 'number' ||
                    !props.payload
                  ) {
                    return <g />;
                  }
                  const { cx, cy, payload } = props;
                  const style = getHeatStyle(payload.count, payload.tierIndex);
                  return (
                    <g>
                      <rect
                        x={cx - cellWidth / 2}
                        y={cy - cellHeight / 2}
                        width={cellWidth}
                        height={cellHeight}
                        rx={4}
                        fill={style.fill}
                        stroke={style.stroke}
                        strokeWidth={1}
                      />
                      {payload.count > 0 && cellWidth >= 18 && (
                        <text
                          x={cx}
                          y={cy + 4}
                          textAnchor="middle"
                          fill={style.text}
                          fontSize={11}
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight={600}
                        >
                          {payload.count}
                        </text>
                      )}
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Total Arrival Strip synchronized below the 24 columns */}
        <div
          className="mt-2 grid items-center text-center"
          style={{
            paddingLeft: `${CHART_MARGIN.left}px`,
            paddingRight: `${CHART_MARGIN.right}px`,
            gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
          }}
          aria-label="Hourly total patient inflow counts"
        >
          {buckets.map((b) => (
            <div
              key={b.hourIndex}
              title={`${b.label}: ${b.total} total arrivals`}
              className={`font-mono tabular-nums text-[10px] leading-tight ${
                b.total >= 3
                  ? 'text-red-700 font-semibold'
                  : b.total > 0
                    ? 'text-slate-700 font-medium'
                    : 'text-slate-300'
              }`}
            >
              {b.total}
            </div>
          ))}
        </div>
        <div
          className="mt-0.5 text-[10px] text-slate-400"
          style={{ paddingLeft: `${CHART_MARGIN.left}px` }}
        >
          Hourly total arrivals (24h rolling window ending current hour)
        </div>
      </div>
    </section>
  );
}
