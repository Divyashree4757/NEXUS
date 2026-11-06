import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, CheckCircle2, CircleDashed, X, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import { fmtDate } from '@/lib/utils'
import type { Decision, Incident } from '@/types'
import { Badge, Button, ErrorState, LoadingBlock, Ref, SeverityBadge, SourceBadge } from '@/components/ui'

/** Slide-over showing the full remembered record behind any D-/INC- reference. */
export function RecordDrawer() {
  const { record, openRecord } = useApp()
  return (
    <AnimatePresence>
      {record && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => openRecord(null)} />
          <motion.aside role="dialog" aria-label={`Record ${record}`}
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line2 bg-panel shadow-2xl"
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.2 }}>
            <Body id={record} onClose={() => openRecord(null)} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

function Body({ id, onClose }: { id: string; onClose: () => void }) {
  const isInc = id.startsWith('INC')
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync<Decision | Incident>(() => (isInc ? api.incident(id) : api.decision(id)), [id])
  return (
    <>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-sub">{id}</span>
          <SourceBadge source="seed" />
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-sub hover:bg-raised hover:text-fg" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
        {loading && <LoadingBlock rows={6} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && !isInc && <DecisionBody d={data as Decision} />}
        {data && isInc && <IncidentBody i={data as Incident} />}
      </div>
      {data && (
        <div className="border-t border-line px-5 py-3">
          <Button variant="primary" className="w-full" icon={<ArrowUpRight className="h-4 w-4" />}
            onClick={() => { onClose(); nav(isInc ? `/incidents/${id}` : `/decisions/${id}`) }}>
            Open full {isInc ? 'incident' : 'decision'}
          </Button>
        </div>
      )}
    </>
  )
}

const held = (h: boolean | null) =>
  h === false ? <XCircle className="h-4 w-4 shrink-0 text-crit" /> : h ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" /> : <CircleDashed className="h-4 w-4 shrink-0 text-faint" />

function DecisionBody({ d }: { d: Decision }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold leading-snug">{d.title}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5"><Badge>{d.project}</Badge><Badge>{d.category}</Badge><Badge>{d.owner}</Badge></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[['Estimated', d.estimate_weeks ? `${d.estimate_weeks}w` : '—'], ['Actual', d.actual_weeks ? `${d.actual_weeks}w` : 'open'],
          ['Ratio', d.actual_weeks && d.estimate_weeks ? `${(d.actual_weeks / d.estimate_weeks).toFixed(1)}x` : '—']].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-bg/50 p-2.5"><div className="text-2xs text-faint">{k}</div><div className="tnum mt-0.5 font-semibold">{v}</div></div>
        ))}
      </div>
      <Section title="Assumptions">
        {d.assumptions.map((a, i) => (
          <div key={i} className="flex gap-2 py-1"><span className="mt-0.5">{held(a.held)}</span><div>{a.text}{a.note && <div className="text-xs text-sub">{a.note}</div>}</div></div>
        ))}
      </Section>
      {d.risks.length > 0 && <Section title="Risks raised">
        {d.risks.map((r, i) => (
          <div key={i} className="py-1"><span className="font-medium">{r.raised_by}</span>: {r.text}
            <div className="mt-0.5 flex gap-1.5">{r.addressed === false && <Badge tone="amber">ignored</Badge>}{r.addressed && <Badge tone="green">addressed</Badge>}{r.materialized && <Badge tone="red">happened</Badge>}</div>
          </div>
        ))}
      </Section>}
      {d.outcome_summary && <Section title="Outcome"><p className="text-sub">{d.outcome_summary}</p></Section>}
      {d.linked_incidents.length > 0 && <Section title="Led to">{d.linked_incidents.map((x) => <Ref key={x} id={x} className="mr-1" />)}</Section>}
      <div className="text-xs text-faint">Proposed {fmtDate(d.proposed_at)}{d.closed_at && ` · closed ${fmtDate(d.closed_at)}`}</div>
    </div>
  )
}

function IncidentBody({ i }: { i: Incident }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold leading-snug">{i.title}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5"><SeverityBadge sev={i.severity} /><Badge>{i.service}</Badge><Badge tone={i.status === 'resolved' ? 'green' : 'amber'}>{i.status}</Badge></div>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-2xs text-sub">{i.error_signature}</pre>
      <Section title="Fixes tried">
        {i.attempted_fixes.length ? i.attempted_fixes.map((f, k) => (
          <div key={k} className="flex items-center justify-between gap-2 py-1">
            <span>{f.action}</span>
            <Badge tone={f.result === 'resolved' ? 'green' : f.result === 'temporary' ? 'amber' : 'red'}>{f.result}{f.result === 'temporary' && f.lasted_days != null ? ` · ${f.lasted_days}d` : ''}</Badge>
          </div>
        )) : <p className="text-sub">None recorded yet.</p>}
      </Section>
      {i.root_cause && <Section title="Root cause"><p className="text-sub">{i.root_cause}</p></Section>}
      {i.linked_decision && <Section title="Traced to decision"><Ref id={i.linked_decision} /></Section>}
      <div className="text-xs text-faint">{fmtDate(i.date)}{i.ttr_minutes ? ` · resolved in ${i.ttr_minutes} min` : ''}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div><div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-faint">{title}</div>{children}</div>
}
