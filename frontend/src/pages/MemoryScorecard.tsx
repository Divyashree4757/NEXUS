import { motion } from 'framer-motion'
import { ChevronDown, Gauge, Info } from 'lucide-react'
import { useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, ChartTooltip } from '@/charts/theme'
import { Badge, Card, ErrorState, LoadingBlock, PageHeader, Ref, SourceBadge } from '@/components/ui'
import { cn, fmtDate } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { ScoreMetric } from '@/types'

export default function MemoryScorecard() {
  const { team, version } = useApp()
  const { data, error, loading, reload } = useAsync(() => api.scorecard(team), [team, version])
  return (
    <div>
      <PageHeader title="Memory Scorecard" description="How healthy this team's engineering memory is. Every number is calculated from stored records, with its formula, trend, supporting records and how complete the underlying data is."
        meta={<><Badge tone="blue" icon={<Gauge className="h-3 w-3" />}>Organisational memory</Badge><SourceBadge source="seed" />{data && <span className="text-2xs text-faint">computed {fmtDate(data.generated)}</span>}</>} />
      {loading && <Card><LoadingBlock rows={8} /></Card>}
      {error && <Card><ErrorState error={error} onRetry={reload} /></Card>}
      {data && (
        <>
          <Card className="mb-4 flex items-start gap-3 p-4 text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="text-sub">{data.note}</span></Card>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.metrics.map((m, i) => <MetricCard key={m.id} m={m} i={i} />)}
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ m, i }: { m: ScoreMetric; i: number }) {
  const [open, setOpen] = useState(false)
  const comp = m.completeness ?? 0
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <Card className="flex h-full flex-col">
        <div className="flex-1 p-4">
          <div className="text-xs font-medium text-sub">{m.name}</div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="tnum text-3xl font-semibold tracking-tight">{m.value ?? '—'}</span>
            {m.value != null && m.unit && <span className="text-sm text-sub">{m.unit}</span>}
            {m.lower_is_better && <span className="ml-auto text-2xs text-faint">lower is better</span>}
          </div>
          <p className="mt-2 text-2xs text-faint">{m.explanation}</p>
          {m.trend.length > 1 ? (
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={70}>
                <LineChart data={m.trend}>
                  <XAxis dataKey="period" hide /><YAxis hide domain={['auto', 'auto']} />
                  <Tooltip content={<ChartTooltip fmt={(v, _n, p) => `${v}${m.unit} (n=${(p as { n: number }).n})`} />} />
                  <Line dataKey="value" name={m.name} stroke={C.violet} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-2xs text-faint"><span>{m.trend[0].period}</span><span>{m.trend[m.trend.length - 1].period}</span></div>
            </div>
          ) : <div className="mt-3 text-2xs text-faint">No time series for this metric.</div>}
          {m.detail && <ul className="mt-2 space-y-0.5 text-2xs text-sub">{m.detail.map((d) => <li key={d}>· {d}</li>)}</ul>}
          <div className="mt-3">
            <div className="flex justify-between text-2xs"><span className="text-faint">Data completeness</span><span className="tnum text-sub">{comp}%</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"><div className={cn('h-full rounded-full', comp >= 90 ? 'bg-ok' : comp >= 70 ? 'bg-warn' : 'bg-crit')} style={{ width: `${comp}%` }} /></div>
          </div>
        </div>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center justify-between border-t border-line px-4 py-2 text-2xs text-sub hover:bg-raised/40 hover:text-fg">
          {m.records.length} {m.records_label}<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        {open && <div className="flex flex-wrap gap-1 border-t border-line/60 px-4 py-2.5">{m.records.length ? m.records.map((r) => (/^(D|INC)-\d{4}$/.test(r) ? <Ref key={r} id={r} /> : <Badge key={r}>{r}</Badge>)) : <span className="text-2xs text-faint">None</span>}</div>}
      </Card>
    </motion.div>
  )
}

