import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Dna, Lightbulb } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, ChartTooltip, axis } from '@/charts/theme'
import { Badge, Card, Confidence, ErrorState, LoadingBlock, PageHeader, Ref, SourceBadge, type Tone } from '@/components/ui'
import { cn, fmtDate } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { DnaPattern } from '@/types'

const STATUS: Record<DnaPattern['status'], { label: string; tone: Tone }> = {
  pattern: { label: 'Recurring pattern', tone: 'red' },
  weak: { label: 'Emerging', tone: 'amber' },
  not_observed: { label: 'Not observed', tone: 'green' },
  insufficient_data: { label: 'Not enough data', tone: 'neutral' },
}
const KIND: Record<string, string> = { estimation: 'Estimation', assumption: 'Assumptions', architecture: 'Architecture', warning: 'Warnings', fix: 'Incident fixes' }

export default function DecisionDNA() {
  const { team, version } = useApp()
  const { data, error, loading, reload } = useAsync(() => api.dna(team), [team, version])
  const found = data?.patterns.filter((p) => p.status === 'pattern').length ?? 0
  return (
    <div>
      <PageHeader title="Decision DNA" description="The recurring habits and blind spots in how this team decides, estimates and fixes things. Every pattern is counted from recorded decisions and outcomes."
        meta={<><Badge tone="violet" icon={<Dna className="h-3 w-3" />}>Organisational profile</Badge><SourceBadge source="seed" /></>} />
      {loading && <Card><LoadingBlock rows={8} label="Profiling decision history" /></Card>}
      {error && <Card><ErrorState error={error} onRetry={reload} /></Card>}
      {data && (
        <>
          <Card className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
            <div><span className="tnum text-2xl font-semibold">{found}</span> <span className="text-sub">recurring patterns</span></div>
            <div><span className="tnum text-2xl font-semibold">{data.closed_decisions}</span> <span className="text-sub">closed decisions analysed</span></div>
            <p className="flex-1 text-xs text-sub">Patterns marked “Not enough data” are shown on purpose: NEXUS won't claim a habit it hasn't seen.</p>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.patterns.map((p, i) => <PatternCard key={p.id} p={p} index={i} />)}
          </div>
        </>
      )}
    </div>
  )
}

function PatternCard({ p, index }: { p: DnaPattern; index: number }) {
  const [open, setOpen] = useState(false)
  const s = STATUS[p.status]
  const dim = p.status === 'insufficient_data' || p.status === 'not_observed'
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
      <Card className={cn('flex h-full flex-col', dim && 'opacity-70')}>
        <div className="flex-1 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.label}</Badge><Badge>{KIND[p.kind] || p.kind}</Badge>
          </div>
          <h3 className="mt-2.5 text-[15px] font-semibold leading-snug">{p.title}</h3>
          {p.n > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Metric k="Supporting records" v={`${p.supporting} of ${p.n}`} />
              <Metric k="Frequency" v={p.frequency != null ? `${Math.round(p.frequency * 100)}%` : '—'} />
              <div><div className="text-2xs text-faint">Confidence</div>{p.confidence != null ? <Confidence value={p.confidence} className="mt-1.5" /> : '—'}</div>
            </div>
          )}
          {p.trend.length > 1 && (
            <div className="mt-4">
              <div className="mb-1 text-2xs text-faint">Trend · share of records showing the pattern, per half-year</div>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={p.trend}>
                  <XAxis dataKey="period" {...axis} tick={{ fill: '#64708a', fontSize: 10 }} />
                  <YAxis hide domain={[0, 1]} />
                  <Tooltip content={<ChartTooltip fmt={(v, _n, pl) => `${Math.round(v * 100)}% (${(pl as { hits: number }).hits} of ${(pl as { n: number }).n})`} />} />
                  <Bar dataKey="rate" name="Rate" fill={p.status === 'pattern' ? C.red : C.amber} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {p.breakdown && (
            <div className="mt-3 space-y-1">{p.breakdown.map((b) => (
              <div key={b.assumption} className="flex items-center justify-between gap-3 text-xs"><span className="text-sub">“{b.assumption}”</span><span className="tnum shrink-0">{b.broke} of {b.made}</span></div>))}</div>
          )}
          <div className="mt-4 flex gap-2 rounded-lg border border-line bg-bg/40 p-3 text-xs">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span><span className="font-medium text-fg">Recommended improvement: </span><span className="text-sub">{p.recommendation}</span></span>
          </div>
        </div>
        {p.evidence.length > 0 && (
          <>
            <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center justify-between border-t border-line px-5 py-2.5 text-xs text-sub hover:bg-raised/40 hover:text-fg">
              Inspect {p.evidence.length} supporting record{p.evidence.length > 1 ? 's' : ''}<ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.ul initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                  {p.evidence.map((e, k) => (
                    <li key={e.id + k} className="flex items-start gap-3 border-t border-line/60 px-5 py-2.5 text-xs">
                      <Ref id={e.id} />
                      <div className="min-w-0 flex-1"><div className="truncate">{e.title}</div>{e.detail && <div className="text-faint">{e.detail}</div>}</div>
                      <span className="shrink-0 text-2xs text-faint">{fmtDate(e.date)}</span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </>
        )}
      </Card>
    </motion.div>
  )
}

function Metric({ k, v }: { k: string; v: string }) {
  return <div><div className="text-2xs text-faint">{k}</div><div className="tnum mt-0.5 text-lg font-semibold">{v}</div></div>
}
