import { motion } from 'framer-motion'
import { AlertTriangle, BrainCircuit, CheckCircle2, FlaskConical, HelpCircle, Scale, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { MemoryItem } from '@/components/memory/Evidence'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, PageHeader, Ref, SourceBadge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp } from '@/state/app'
import type { WhatIfEvidence, WhatIfResult, WhatIfSide } from '@/types'

const PRESETS = [
  { label: 'Kafka vs RabbitMQ + outbox', original: 'Move settlement events from RabbitMQ to Kafka', alternative: 'Keep RabbitMQ and add a transactional outbox',
    description: 'Settlement events from payment-gateway to ledger-service', workload: '~2k events/s, 10x spikes on sale days', constraints: 'Exactly-once into the ledger; 4 engineers', infrastructure: 'Existing Kafka cluster from phase 1' },
  { label: 'PostgreSQL vs MongoDB', original: 'Store fraud features in PostgreSQL', alternative: 'Store fraud features in MongoDB',
    description: 'Feature storage for fraud-scorer', workload: 'Point lookups under 10ms, nightly batch writes', constraints: 'Point-in-time joins for training', infrastructure: 'Managed Postgres already in use' },
  { label: 'PgBouncer vs bigger pools', original: 'Put PgBouncer in front of the payments database', alternative: 'Increase the per-pod connection pool size',
    description: 'payment-gateway connection timeouts at peak', workload: '12 replicas at peak', constraints: 'Postgres max_connections 500', infrastructure: 'Kubernetes, HPA on CPU' },
]

export default function WhatIf() {
  const { team, toast } = useApp()
  const [f, setF] = useState({ original: '', alternative: '', description: '', workload: '', constraints: '', infrastructure: '' })
  const [res, setRes] = useState<WhatIfResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Error | null>(null)
  const run = async () => {
    setBusy(true); setErr(null)
    try { const r = await api.whatif({ team, ...f }); setRes(r); toast('memory', 'Comparison ready', 'Hypothetical estimate based on team history') }
    catch (e) { setErr(e as Error) } finally { setBusy(false) }
  }
  const valid = f.original.trim().length >= 3 && f.alternative.trim().length >= 3
  return (
    <div>
      <PageHeader title="What-If Simulator" description="Compare two architectural options against what this team has actually lived through. Results are hypothetical estimates, not historical results."
        meta={<><Badge tone="amber" icon={<FlaskConical className="h-3 w-3" />}>Counterfactual · hypothetical</Badge><SourceBadge source="seed" /></>} />
      <Card className="mb-4 p-5">
        <div className="mb-4 flex flex-wrap gap-1.5">
          <span className="mr-1 text-xs text-sub">Try:</span>
          {PRESETS.map((p) => <button key={p.label} onClick={() => { const { label: _l, ...rest } = p; setF(rest); setRes(null) }} className="rounded-md border border-line2 px-2 py-1 text-2xs text-sub hover:border-primary/50 hover:text-fg">{p.label}</button>)}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Original decision"><input className="input" value={f.original} onChange={(e) => setF({ ...f, original: e.target.value })} placeholder="What you did, or plan to do" /></Field>
          <Field label="Alternative decision"><input className="input" value={f.alternative} onChange={(e) => setF({ ...f, alternative: e.target.value })} placeholder="What you could do instead" /></Field>
          <Field label="Project description"><textarea className="input min-h-[70px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Expected workload"><textarea className="input min-h-[70px]" value={f.workload} onChange={(e) => setF({ ...f, workload: e.target.value })} /></Field>
          <Field label="Technical constraints"><input className="input" value={f.constraints} onChange={(e) => setF({ ...f, constraints: e.target.value })} /></Field>
          <Field label="Estimated infrastructure requirements"><input className="input" value={f.infrastructure} onChange={(e) => setF({ ...f, infrastructure: e.target.value })} /></Field>
        </div>
        <div className="mt-4 flex justify-end"><Button variant="memory" loading={busy} disabled={!valid} icon={<Scale className="h-4 w-4" />} onClick={run}>Compare with team history</Button></div>
      </Card>
      {err && <Card><ErrorState error={err} onRetry={run} /></Card>}
      {!res && !busy && !err && <Card><EmptyState icon={<Scale className="h-5 w-5" />} title="Pick a preset or describe two options" body="NEXUS recalls similar past decisions for each option from Hindsight, compares their real outcomes, and explains the trade-offs." /></Card>}
      {res && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn-soft/30 p-3 text-xs text-warn-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Hypothetical estimate, not a historical result. Built from {res.evidence.original.n + res.evidence.alternative.n} matching past decisions and {res.memories.original.length + res.memories.alternative.length} recalled memories · generated by {res.generated_by}.</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <OptionCard title="Original decision" name={res.original} side={res.analysis.original} ev={res.evidence.original} tone="blue" recommended={res.analysis.final.recommended === 'original'} />
            <OptionCard title="Alternative decision" name={res.alternative} side={res.analysis.alternative} ev={res.evidence.alternative} tone="violet" recommended={res.analysis.final.recommended === 'alternative'} />
          </div>
          {res.evidence.shared.length > 0 && (
            <Card className="p-4 text-xs">
              <div className="mb-1.5 font-medium">Shared evidence</div>
              <p className="mb-2 text-sub">These past decisions involve both options, so they're shown here instead of being counted for either side.</p>
              {res.evidence.shared.map((d) => <div key={d.id} className="flex items-center gap-2 py-0.5"><Ref id={d.id} /><span>{d.title}</span>{d.ratio && <span className="text-faint">· {d.ratio}x</span>}{d.incidents.map((i) => <Ref key={i} id={i} />)}</div>)}
            </Card>
          )}
          <Card>
            <CardHeader title="Final analysis" icon={<Scale className="h-4 w-4" />} subtitle="Hypothetical" />
            <div className="grid gap-5 p-5 md:grid-cols-3">
              <div>
                <div className="label">Recommended option</div>
                <div className={cn('mt-1 text-lg font-semibold', res.analysis.final.recommended === 'insufficient evidence' ? 'text-warn-fg' : 'text-fg')}>
                  {res.analysis.final.recommended === 'original' ? res.original : res.analysis.final.recommended === 'alternative' ? res.alternative : 'Not enough evidence to choose'}
                </div>
                <div className="mt-2 text-xs text-sub">Confidence: <Badge tone={res.analysis.final.confidence === 'high' ? 'green' : res.analysis.final.confidence === 'medium' ? 'blue' : 'amber'} className="capitalize">{res.analysis.final.confidence}</Badge></div>
              </div>
              <List title="Supporting reasons" items={res.analysis.final.reasons} icon={<CheckCircle2 className="h-3.5 w-3.5 text-ok" />} />
              <List title="Missing information" items={res.analysis.final.missing_information} icon={<HelpCircle className="h-3.5 w-3.5 text-warn" />} />
              {res.analysis.final.tradeoffs && res.analysis.final.tradeoffs.length > 0 && <div className="md:col-span-3"><List title="Trade-offs" items={res.analysis.final.tradeoffs} icon={<Scale className="h-3.5 w-3.5 text-primary" />} /></div>}
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            {(['original', 'alternative'] as const).map((k) => (
              <Card key={k}>
                <CardHeader title={`Recalled for the ${k} option`} icon={<BrainCircuit className="h-4 w-4 text-memory" />} />
                <div className="space-y-2 p-5 pt-3">{res.memories[k].length ? res.memories[k].map((m, i) => <MemoryItem key={m.id || i} m={m} />) : <p className="text-xs text-sub">Nothing relevant in memory.</p>}</div>
              </Card>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function OptionCard({ title, name, side, ev, tone, recommended }: { title: string; name: string; side: WhatIfSide; ev: WhatIfEvidence; tone: 'blue' | 'violet'; recommended: boolean }) {
  return (
    <Card className={cn('border-t-2', tone === 'blue' ? 'border-t-primary' : 'border-t-memory', recommended && 'ring-1 ring-ok/40')}>
      <div className="p-5">
        <div className="flex items-center justify-between gap-2"><span className="label">{title}</span>{recommended && <Badge tone="green">Recommended</Badge>}</div>
        <h3 className="mt-1 text-base font-semibold">{name}</h3>
        {side.operational_complexity && side.operational_complexity !== 'unknown' && <div className="mt-1 text-xs text-sub">Operational complexity: <span className="capitalize text-fg">{side.operational_complexity}</span></div>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <List title="Advantages" items={side.advantages} icon={<CheckCircle2 className="h-3.5 w-3.5 text-ok" />} />
          <List title="Disadvantages" items={side.disadvantages} icon={<XCircle className="h-3.5 w-3.5 text-crit" />} />
        </div>
        <div className="mt-4"><List title="Potential risks" items={side.risks} icon={<AlertTriangle className="h-3.5 w-3.5 text-warn" />} /></div>
        <div className="mt-4 rounded-lg border border-line bg-bg/40 p-3">
          <div className="text-2xs font-medium uppercase tracking-wide text-faint">Historical evidence</div>
          {ev.n ? (
            <>
              <div className="mt-1 text-xs text-sub">{ev.n} similar decision(s){ev.avg_ratio != null && <> · avg <b className="text-fg">{ev.avg_ratio}x</b> estimate</>}{ev.incidents.length > 0 && <> · {ev.incidents.length} incident(s)</>}</div>
              <div className="mt-2 space-y-1">{ev.decisions.map((d) => <div key={d.id} className="flex items-center gap-2 text-xs"><Ref id={d.id} /><span className="truncate">{d.title}</span></div>)}</div>
            </>
          ) : <div className="mt-1 text-xs text-warn-fg">No comparable decisions in this team's memory.</div>}
        </div>
      </div>
    </Card>
  )
}

function List({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-faint">{title}</div>
      {items.length ? <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2 text-xs"><span className="mt-0.5 shrink-0">{icon}</span><span className="text-fg/90">{x}</span></li>)}</ul>
        : <p className="text-xs text-faint">None identified.</p>}
    </div>
  )
}
