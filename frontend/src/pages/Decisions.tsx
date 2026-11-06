import { AnimatePresence, motion } from 'framer-motion'
import { Check, Plus, Search, Target, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, type Column, DataTable, Dialog, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, RiskBadge, Select, SourceBadge } from '@/components/ui'
import { cn, fmtDate } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { Decision } from '@/types'

export default function Decisions() {
  const { team, version } = useApp()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data, error, loading, reload } = useAsync(() => api.decisions(team), [team, version])
  const [qText, setQ] = useState('')
  const [project, setProject] = useState(() => params.get('project') || 'all')
  const [risk, setRisk] = useState('all')
  const [status, setStatus] = useState('all')
  const open = params.get('new') === '1'

  const projects = useMemo(() => [...new Set((data || []).map((d) => d.project || 'General'))].sort(), [data])
  const rows = useMemo(() => (data || []).filter((d) =>
    (project === 'all' || d.project === project) &&
    (risk === 'all' || d.predicted_risk?.level === risk) &&
    (status === 'all' || d.status === status) &&
    (!qText || `${d.id} ${d.title} ${d.owner} ${d.services.join(' ')}`.toLowerCase().includes(qText.toLowerCase()))), [data, project, risk, status, qText])

  const columns: Column<Decision>[] = [
    { key: 'id', header: 'Decision ID', render: (d) => <span className="font-mono text-xs text-sub">{d.id}</span>, sort: (d) => d.id },
    { key: 'project', header: 'Project', render: (d) => <span className="text-xs text-sub">{d.project}</span>, sort: (d) => d.project, hideOnMobile: true },
    { key: 'title', header: 'Decision', render: (d) => <div className="max-w-[360px]"><div className="truncate font-medium">{d.title}</div><div className="text-2xs text-faint">{d.category} · {d.owner}</div></div>, sort: (d) => d.title },
    { key: 'est', header: 'Estimated', render: (d) => <span className="tnum">{d.estimate_weeks ?? '—'}w</span>, sort: (d) => d.estimate_weeks, hideOnMobile: true },
    { key: 'risk', header: 'Predicted risk', render: (d) => d.predicted_risk ? <RiskBadge level={d.predicted_risk.level} score={d.predicted_risk.score} /> : '—', sort: (d) => d.predicted_risk?.score },
    { key: 'actual', header: 'Actual outcome', hideOnMobile: true, sort: (d) => d.ratio ?? null,
      render: (d) => d.actual_weeks ? <span className="tnum"><span className={cn(d.ratio! >= 1.8 ? 'text-crit-fg' : d.ratio! >= 1.3 ? 'text-warn-fg' : 'text-ok-fg')}>{d.actual_weeks}w · {d.ratio}x</span>{d.linked_incidents.length > 0 && <span className="ml-1.5 text-2xs text-crit-fg">+{d.linked_incidents.length} inc</span>}</span> : <span className="text-faint">pending</span> },
    { key: 'status', header: 'Status', render: (d) => <Badge tone={d.status === 'open' ? 'blue' : 'neutral'}>{d.status === 'open' ? 'In progress' : 'Closed'}</Badge>, sort: (d) => d.status },
    { key: 'date', header: 'Date', render: (d) => <span className="tnum text-xs text-sub">{fmtDate(d.proposed_at)}</span>, sort: (d) => d.proposed_at, hideOnMobile: true },
  ]

  return (
    <div>
      <PageHeader title="Decision Intelligence" description="Understand what your engineering history is telling you before making your next decision."
        meta={<><Badge tone="violet">PREMORTEM</Badge><SourceBadge source="seed" /></>}
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>New decision</Button>} />
      <Card>
        <div className="flex flex-col gap-2 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input value={qText} onChange={(e) => setQ(e.target.value)} placeholder="Search by ID, title, owner or service" className="input h-9 pl-9" aria-label="Search decisions" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select label="Project" value={project} onChange={setProject} options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p, label: p }))]} />
            <Select label="Risk level" value={risk} onChange={setRisk} options={[{ value: 'all', label: 'Any risk' }, ...['critical', 'high', 'medium', 'low'].map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))]} />
            <Select label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Any status' }, { value: 'open', label: 'In progress' }, { value: 'closed', label: 'Closed' }]} />
          </div>
        </div>
        {loading && <LoadingBlock rows={8} label="Loading decision history" />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && <DataTable rows={rows} columns={columns} rowKey={(d) => d.id} onRowClick={(d) => nav(`/decisions/${d.id}`)} initialSort={{ key: 'date', dir: 'desc' }}
          empty={<EmptyState icon={<Target className="h-5 w-5" />} title={data.length ? 'No decisions match these filters' : 'No decisions yet'}
            body={data.length ? 'Clear a filter or search for something else.' : 'Record your first decision and NEXUS will start learning from it.'}
            action={data.length ? <Button size="sm" onClick={() => { setQ(''); setProject('all'); setRisk('all'); setStatus('all') }}>Clear filters</Button> : <Button size="sm" variant="primary" onClick={() => setParams({ new: '1' })}>New decision</Button>} />} />}
      </Card>
      <NewDecisionDialog open={open} onClose={() => setParams({})} projects={projects}
        services={[...new Set((data || []).flatMap((d) => d.services))].sort()} />
    </div>
  )
}

/* ------------------------------------------------------------------ multi-step form */
const STEPS = ['Basics', 'Technical approach', 'Assumptions & risks', 'Review']
const SAMPLE = {
  title: 'Migrate settlement events from RabbitMQ to Kafka (phase 2)', project: 'Event-driven payments', teamSize: '4', estimate: '3',
  description: 'Move payment-gateway webhooks and settlement events onto the Kafka cluster introduced in phase 1, and retire the RabbitMQ settlement exchange.',
  architecture: 'Producers in payment-gateway publish to settlements.v1 (24 partitions, keyed by merchant_id). ledger-service consumes with exactly-once semantics. Cut over behind a producer feature flag.',
  services: ['payment-gateway', 'ledger-service'],
  assumptions: ['No schema changes needed; reuse the existing JSON payloads', 'Consumer lag will stay under a minute', 'We can roll back by flipping the producer flag'],
  risks: ['Rollback once ledger consumes from Kafka is unclear'],
}

function NewDecisionDialog({ open, onClose, projects, services }: { open: boolean; onClose: () => void; projects: string[]; services: string[] }) {
  const { team, toast, refresh } = useApp()
  const nav = useNavigate()
  const empty = { title: '', project: '', teamSize: '3', estimate: '', description: '', architecture: '', services: [] as string[], assumptions: [''], risks: [''] }
  const [f, setF] = useState(empty)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setStep(0) } }, [open])
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const valid = [f.title.trim().length >= 3 && Number(f.estimate) > 0 && f.project.trim().length > 0, true, true, true]

  const submit = async () => {
    setBusy(true)
    try {
      const d = await api.createDecision({
        team, title: f.title.trim(), project: f.project.trim(), description: f.description, architecture: f.architecture,
        estimate_weeks: Number(f.estimate), team_size: Number(f.teamSize) || 3, services: f.services,
        assumptions: f.assumptions.filter((a) => a.trim()), risks: f.risks.filter((r) => r.trim()),
      })
      toast('memory', `${d.id} retained to memory`, 'Running the premortem against your history…')
      refresh(); onClose(); setF(empty)
      nav(`/decisions/${d.id}?analyze=1`)
    } catch (e) {
      toast('error', 'Could not save the decision', (e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} wide title="New decision" description="NEXUS will save this decision to memory and check it against everything your team has done before."
      footer={<>
        {step === 0 && <Button variant="ghost" className="mr-auto" onClick={() => setF({ ...SAMPLE, assumptions: [...SAMPLE.assumptions], risks: [...SAMPLE.risks] })}>Fill with sample</Button>}
        {step > 0 && <Button variant="ghost" className="mr-auto" onClick={() => setStep(step - 1)}>Back</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        {step < 3 ? <Button variant="primary" disabled={!valid[step]} onClick={() => setStep(step + 1)}>Continue</Button>
          : <Button variant="memory" loading={busy} onClick={submit}>Save and analyse</Button>}
      </>}>
      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border text-2xs font-semibold', i < step ? 'border-primary bg-primary text-white' : i === step ? 'border-primary text-primary-fg' : 'border-line2 text-faint')}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('hidden text-xs sm:block', i === step ? 'text-fg' : 'text-faint')}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }} className="space-y-4">
          {step === 0 && <>
            <Field label="Decision title"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Migrate settlement events to Kafka" autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Project" className="sm:col-span-1">
                <input className="input" list="projects" value={f.project} onChange={(e) => set('project', e.target.value)} placeholder="Choose or type" />
                <datalist id="projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="Estimated completion" hint="in weeks"><input className="input" type="number" min="0.5" step="0.5" value={f.estimate} onChange={(e) => set('estimate', e.target.value)} placeholder="3" /></Field>
              <Field label="Team size"><input className="input" type="number" min="1" value={f.teamSize} onChange={(e) => set('teamSize', e.target.value)} /></Field>
            </div>
          </>}
          {step === 1 && <>
            <Field label="Technical description"><textarea className="input min-h-[90px]" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="What are you changing and why?" /></Field>
            <Field label="Proposed architecture"><textarea className="input min-h-[90px]" value={f.architecture} onChange={(e) => set('architecture', e.target.value)} placeholder="Components, data flow, cutover plan" /></Field>
            <Field label="Services affected" hint="Used to find past decisions and incidents on the same services">
              <div className="flex flex-wrap gap-1.5">
                {services.map((s) => {
                  const on = f.services.includes(s)
                  return <button key={s} type="button" onClick={() => set('services', on ? f.services.filter((x) => x !== s) : [...f.services, s])}
                    className={cn('rounded-md border px-2 py-1 text-xs transition-colors', on ? 'border-primary/60 bg-primary-soft/60 text-primary-fg' : 'border-line2 text-sub hover:text-fg')}>{s}</button>
                })}
              </div>
            </Field>
          </>}
          {step === 2 && <>
            <ListField label="Assumptions" hint="Everything the plan depends on being true" items={f.assumptions} onChange={(v) => set('assumptions', v)} placeholder="e.g. No schema changes needed" />
            <ListField label="Identified risks" items={f.risks} onChange={(v) => set('risks', v)} placeholder="e.g. Rollback path is untested" />
          </>}
          {step === 3 && (
            <div className="space-y-3 text-sm">
              <ReviewRow k="Decision" v={f.title} />
              <ReviewRow k="Project" v={`${f.project} · ${f.teamSize} engineers · ${f.estimate} weeks`} />
              <ReviewRow k="Services" v={f.services.join(', ') || 'Not specified — NEXUS will try to infer them'} />
              <ReviewRow k="Assumptions" v={f.assumptions.filter(Boolean).join(' · ') || 'None'} />
              <ReviewRow k="Risks" v={f.risks.filter(Boolean).join(' · ') || 'None'} />
              <div className="rounded-lg border border-memory/25 bg-memory-soft/20 p-3 text-xs text-sub">
                On save NEXUS <b className="text-fg">retains</b> this decision in the <span className="font-mono">{team}</span> memory bank, then <b className="text-fg">recalls</b> similar decisions, broken assumptions, ignored warnings and incidents, and scores the risk.
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Dialog>
  )
}

function ListField({ label, hint, items, onChange, placeholder }: { label: string; hint?: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input className="input" value={it} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => onChange(items.length > 1 ? items.filter((_, j) => j !== i) : [''])} icon={<Trash2 className="h-3.5 w-3.5" />} />
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...items, ''])}>Add</Button>
      </div>
    </Field>
  )
}

function ReviewRow({ k, v }: { k: string; v: string }) {
  return <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-line pb-2.5"><span className="text-xs text-faint">{k}</span><span>{v}</span></div>
}
