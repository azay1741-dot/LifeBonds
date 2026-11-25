import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { HourlyInflowBucket } from '../types';

interface ArrivalsCompletionsLineChartProps {
  buckets: HourlyInflowBucket[];
}

interface LineDatum {
  label: string;
  arrivals: number;
  completions: number;
  netDelta: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: LineDatum }>;
  viewMode: 'hourly' | 'cumulative';
}

function ThroughputTooltip({ active, payload, viewMode }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) {
    return null;
  }
  const d = payload[0].payload;
  const nextHourNum = (Number(d.label.slice(0, 2)) + 1) % 24;
  const windowEnd = `${String(nextHourNum).padStart(2, '0')}:00`;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs space-y-1.5">
      <div className="font-mono tabular-nums font-semibold text-slate-900">
        {viewMode === 'hourly' ? `${d.label} – ${windowEnd}` : `Through ${windowEnd}`}
      </div>
      <div className="space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-amber-700 font-sans font-medium">
            <span className="h-2 w-2 rounded-full bg-amber-600" />
            Arrivals
          </span>
          <span className="font-semibold text-slate-900">{d.arrivals}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-teal-800 font-sans font-medium">
            <span className="h-2 w-2 rounded-full bg-teal-600" />
            Completions
          </span>
          <span className="font-semibold text-slate-900">{d.completions}</span>
        </div>
      </div>
      <div className="pt-1 border-t border-slate-100 text-[11px] text-slate-500 font-mono tabular-nums">
        Net load delta: {d.netDelta > 0 ? `+${d.netDelta}` : d.netDelta}
      </div>
    </div>
  );
}

export function ArrivalsCompletionsLineChart({ buckets }: ArrivalsCompletionsLineChartProps) {
  const [viewMode, setViewMode] = useState<'hourly' | 'cumulative'>('hourly');

  const { seriesData, totalArrivals, totalCompletions } = useMemo(() => {
    let runningArrivals = 0;
    let runningCompletions = 0;

    const points: LineDatum[] = buckets.map((b) => {
      runningArrivals += b.total;
      runningCompletions += b.completed;
      if (viewMode === 'cumulative') {
        return {
          label: b.label,
          arrivals: runningArrivals,
          completions: runningCompletions,
          netDelta: runningArrivals - runningCompletions,
        };
      }
      return {
        label: b.label,
        arrivals: b.total,
        completions: b.completed,
        netDelta: b.total - b.completed,
      };
    });

    return {
      seriesData: points,
      totalArrivals: runningArrivals,
      totalCompletions: runningCompletions,
    };
  }, [buckets, viewMode]);

  const net24h = totalArrivals - totalCompletions;

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            24-Hour Arrivals vs. Completions Trend
          </h3>
          <p className="text-xs text-slate-500">
            Resource planning throughput comparison ·{' '}
            <span className="font-mono tabular-nums text-amber-800 font-medium">
              {totalArrivals} arrivals
            </span>{' '}
            vs.{' '}
            <span className="font-mono tabular-nums text-teal-800 font-medium">
              {totalCompletions} completions
            </span>{' '}
            ·{' '}
            <span className="font-mono tabular-nums text-slate-700">
              Net {net24h > 0 ? `+${net24h}` : net24h}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="w-3 h-0.5 bg-amber-600 inline-block" />
              <span>Arrivals</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="w-3 h-0.5 bg-teal-600 inline-block" />
              <span>Completions (Discharged / Transferred)</span>
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg no-print">
            <button
              type="button"
              onClick={() => setViewMode('hourly')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'hourly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hourly
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cumulative')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'cumulative'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cumulative
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-3 w-full h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={seriesData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="label"
              interval={2}
              axisLine={{ stroke: '#E2E8F0' }}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono, monospace' }}
            />
            <YAxis
              allowDecimals={false}
              width={36}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono, monospace' }}
            />
            <Tooltip content={<ThroughputTooltip viewMode={viewMode} />} />
            <Line
              type="monotone"
              dataKey="arrivals"
              name="Arrivals"
              stroke="#D97706"
              strokeWidth={2.25}
              dot={{ r: 2.5, fill: '#D97706', strokeWidth: 0 }}
              activeDot={{ r: 4.5, fill: '#D97706' }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="completions"
              name="Completions"
              stroke="#0D9488"
              strokeWidth={2.25}
              dot={{ r: 2.5, fill: '#0D9488', strokeWidth: 0 }}
              activeDot={{ r: 4.5, fill: '#0D9488' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
