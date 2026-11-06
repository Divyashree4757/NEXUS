import { Markdown } from '@/components/ui/Markdown'
import { motion } from 'framer-motion'
import { ArrowLeft, BrainCircuit, CheckCircle2, ClipboardCheck, History, Loader2, PlayCircle, RotateCcw, ShieldAlert, Sparkles, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EvidenceCard, MemoryItem } from '@/components/memory/Evidence'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, LoadingBlock, Ref, RiskBadge, Segmented, SourceBadge } from '@/components/ui'
import { cn, fmtDate, riskColor } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { Decision, GenericReport, PremortemReport } from '@/types'

type Tab = 'analysis' | 'outcome' | 'replay'

export default function DecisionDetail() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const { version } = useApp()
  const { data: d, error, loading, reload } = useAsync(() => api.decision(id), [id, version])
  const [tab, setTab] = useState<Tab>('analysis')
  useEffect(() => { if (d) setTab(d.status === 'closed' && params.get('analyze') !== '1' ? 'replay' : 'analysis') }, [d?.id]) // eslint-disable-line

  if (loading && !d) return <Card><LoadingBlock rows={8} label={`Loading ${id}`} /></Card>
  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>
  if (!d) return null
  return (
    <div>
      <button onClick={() => nav('/decisions')} className="mb-4 inline-flex items-center gap-1.5 text-xs text-sub hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" />Decision Intelligence</button>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-sub">
            <span className="font-mono">{d.id}</span><Badge>{d.project}</Badge><Badge>{d.category}</Badge>
            <Badge tone={d.status === 'open' ? 'blue' : 'neutral'}>{d.status === 'open' ? 'In progress' : 'Closed'}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{d.title}</h1>
          <div className="mt-1.5 text-sm text-sub">{d.owner} · {d.team_size ?? '—'} engineers · estimated {d.estimate_weeks}w · proposed {fmtDate(d.proposed_at)}
            {d.services.length > 0 && <> · {d.services.join(', ')}</>}</div>
        </div>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'analysis', label: 'AI analysis' },
          { value: 'outcome', label: d.status === 'open' ? 'Log outcome' : 'Outcome' },
          ...(d.status === 'closed' ? [{ value: 'replay' as Tab, label: 'Decision replay' }] : []),
        ]} />
      </div>
      {tab === 'analysis' && <Analysis d={d} auto={params.get('analyze') === '1'} onDone={() => setParams({})} />}
      {tab === 'outcome' && (d.status === 'open' ? <div className="space-y-4"><ProgressNotes d={d} /><OutcomeForm d={d} /></div> : <OutcomeView d={d} />)}
      {tab === 'replay' && <Replay id={d.id} />}
    </div>
  )
}

/* ------------------------------------------------------------------ analysis */
const PIPELINE = ['Retain decision to memory', 'Recall similar decisions', 'Recall broken assumptions & ignored warnings', 'Recall linked incidents', 'Reflect on team lessons', 'Score risk & write recommendations']

function Analysis({ d, auto, onDone }: { d: Decision; auto: boolean; onDone: () => void }) {
  const { team, toast } = useApp()
  const [res, setRes] = useState<{ with_memory: PremortemReport; without_memory?: GenericReport } | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)
  const [err, setErr] = useState<Error | null>(null)
  const [view, setView] = useState<'memory' | 'compare'>('memory')

  const run = async () => {
    setBusy(true); setErr(null); setStage(0)
    const t = setInterval(() => setStage((s) => Math.min(s + 1, PIPELINE.length - 1)), 650)
    try {
      const r = await api.premortem(team, d.id)
      setRes(r)
      toast('memory', 'Premortem complete', `${r.with_memory.memory_stats.recalled} memories recalled · ${r.with_memory.warnings.length} warnings`)
    } catch (e) { setErr(e as Error) } finally { clearInterval(t); setBusy(false); onDone() }
  }
  useEffect(() => { if (auto) run() }, []) // eslint-disable-line

  if (busy) return (
    <Card className="p-8">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2 text-sm font-medium"><BrainCircuit className="h-4 w-4 text-memory" />Checking this decision against your history</div>
        <ol className="space-y-2.5">
          {PIPELINE.map((p, i) => (
            <li key={p} className={cn('flex items-center gap-3 text-sm', i > stage ? 'text-faint' : 'text-fg')}>
              {i < stage ? <CheckCircle2 className="h-4 w-4 text-ok" /> : i === stage ? <Loader2 className="h-4 w-4 animate-spin text-memory" /> : <span className="h-4 w-4 rounded-full border border-line2" />}
              {p}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  )
  if (err) return <Card><ErrorState error={err} onRetry={run} /></Card>
  if (!res) return (
    <Card><EmptyState icon={<Sparkles className="h-5 w-5 text-memory" />} title="Run a premortem on this decision"
      body="NEXUS recalls similar past decisions, assumptions that broke, warnings that were ignored and incidents that followed, then scores the risk."
      action={<Button variant="memory" icon={<PlayCircle className="h-4 w-4" />} onClick={run}>Run premortem</Button>} /></Card>
  )

  const w = res.with_memory
  const g = res.without_memory
  const assumptionW = w.warnings.filter((x) => x.type === 'assumption')
  const similar = Array.from(new Map(w.evidence.flatMap((m) => m.records || []).filter((r) => r.id !== d.id).map((r) => [r.id, r])).values()).slice(0, 8)

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-sub">
          <SourceBadge source={w.memory_stats.memory_mode} />
          <span>{w.memory_stats.strategies} recall strategies · {w.memory_stats.recalled} memories recalled · {w.memory_stats.used} used</span>
        </div>
        <div className="flex gap-2">
          <Segmented value={view} onChange={setView} options={[{ value: 'memory', label: 'With memory' }, { value: 'compare', label: 'With vs without memory' }]} />
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={run}>Re-run</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="p-5">
          <div className="text-xs font-medium text-sub">Overall risk score</div>
          <RiskGauge score={w.risk.score} level={w.risk.level} />
          <div className="mt-1 text-center"><RiskBadge level={w.risk.level} /></div>
          <div className="mt-5 space-y-1.5">
            {w.risk.factors.map((f) => (
              <div key={f.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-sub">{f.label}</span><span className="tnum shrink-0 text-fg">+{f.points}</span>
              </div>
            ))}
            {!w.risk.factors.length && <p className="text-xs text-sub">No risk signals found in this team's history.</p>}
          </div>
          {w.corrected_estimate && (
            <div className="mt-5 rounded-lg border border-memory/25 bg-memory-soft/20 p-3.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-memory-fg">Team estimation pattern</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="tnum text-3xl font-semibold">{w.corrected_estimate.corrected_weeks}w</span>
                <span className="text-xs text-sub">realistic · not <span className="line-through">{w.corrected_estimate.raw_estimate_weeks}w</span></span>
              </div>
              <div className="mt-1 text-2xs text-sub">range {w.corrected_estimate.range_weeks[0]}–{w.corrected_estimate.range_weeks[1]}w · {w.corrected_estimate.factor}x from {w.corrected_estimate.category_history} past {w.corrected_estimate.category} decisions</div>
            </div>
          )}
        </Card>

        {view === 'compare' && g ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-t-2 border-t-faint">
              <CardHeader title="Without memory" subtitle="Same model, no team history" />
              <div className="space-y-2 px-5 pb-5 pt-3">
                <p className="text-sm text-sub">{g.summary}</p>
                {g.warnings.map((x, i) => <div key={i} className="rounded-lg border border-line bg-bg/40 p-3"><div className="text-sm text-fg/80">{x.title}</div><div className="mt-0.5 text-xs text-faint">{x.detail}</div></div>)}
              </div>
            </Card>
            <Card className="border-t-2 border-t-memory">
              <CardHeader title="With Hindsight memory" subtitle={<span className="capitalize">Verdict: {w.verdict.replace(/-/g, ' ')}</span>} icon={<BrainCircuit className="h-4 w-4 text-memory" />} />
              <div className="space-y-2 px-5 pb-5 pt-3">
                <p className="text-sm">{w.summary}</p>
                {w.warnings.map((x, i) => <div key={i} className="rounded-lg border border-memory/20 bg-memory-soft/15 p-3"><div className="text-sm">{x.title}</div><div className="mt-1 flex flex-wrap gap-1">{[...new Set(x.evidence)].slice(0, 5).map((r) => <Ref key={r} id={r} />)}</div></div>)}
              </div>
            </Card>
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            <Card className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('text-lg font-semibold capitalize', w.verdict === 'rethink' ? 'text-crit-fg' : w.verdict === 'go' ? 'text-ok-fg' : 'text-warn-fg')}>{w.verdict.replace(/-/g, ' ')}</span>
                {w.first_time && <Badge tone="blue">First decision of its kind</Badge>}
              </div>
              <p className="mt-2 text-sm text-sub">{w.summary}</p>
              {w.reflection && <div className="mt-4 rounded-lg border border-memory/25 bg-memory-soft/20 p-3 text-xs"><div className="mb-1 font-medium text-memory-fg">Hindsight reflection</div><Markdown text={w.reflection} className="text-sub" /></div>}
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader title="Historical similarities" subtitle="Records behind the recalled memories" icon={<History className="h-4 w-4" />} />
                <div className="space-y-1.5 px-5 pb-5 pt-3">
                  {similar.length ? similar.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs"><Ref id={r.id} /><span className="truncate text-sub">{r.title}</span></div>
                  )) : <p className="text-xs text-sub">No similar records recalled.</p>}
                </div>
              </Card>
              <Card>
                <CardHeader title="Previous failed assumptions" subtitle="From the assumption graveyard" icon={<XCircle className="h-4 w-4 text-crit" />} />
                <div className="space-y-2 px-5 pb-5 pt-3">
                  {assumptionW.length ? assumptionW.map((x) => (
                    <div key={x.title} className="text-xs"><div className="text-fg">{x.title.replace('Assumption Graveyard: ', '')}</div><div className="mt-0.5 text-sub">{x.detail}</div></div>
                  )) : <p className="text-xs text-sub">None of these assumptions has failed before.</p>}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      <Card>
        <CardHeader title="Evidence from previous decisions" subtitle="Each recommendation shows the retrieved history, what happened, why it matters now and how confident NEXUS is"
          icon={<ShieldAlert className="h-4 w-4" />} />
        <div className="space-y-2 p-5">
          {w.warnings.length ? w.warnings.map((x, i) => <EvidenceCard key={x.title} w={x} index={i} defaultOpen={i === 0} />)
            : <EmptyState title="No memory-backed warnings" body="Nothing in this team's history matches this decision yet. Log its outcome so the next one is smarter." />}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recommended precautions" icon={<ClipboardCheck className="h-4 w-4 text-ok" />} />
          <ul className="space-y-2 px-5 pb-5 pt-3">
            {w.checklist.map((c) => <li key={c} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />{c}</li>)}
            {!w.checklist.length && <li className="text-sm text-sub">No extra precautions suggested.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Raw memories recalled" subtitle="Exactly what Hindsight returned, with recall query and document id" icon={<BrainCircuit className="h-4 w-4 text-memory" />} />
          <div className="max-h-[420px] space-y-2 overflow-y-auto px-5 pb-5 pt-3">
            {w.evidence.length ? w.evidence.slice(0, 15).map((m, i) => <MemoryItem key={m.id || i} m={m} />) : <p className="text-sm text-sub">No memories recalled.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}

function RiskGauge({ score, level }: { score: number; level: string }) {
  const r = 52, c = Math.PI * r
  return (
    <svg viewBox="0 0 140 84" className="mx-auto mt-3 w-48" role="img" aria-label={`Risk score ${score} of 100`}>
      <path d="M 18 74 A 52 52 0 0 1 122 74" fill="none" stroke="#222c3f" strokeWidth="10" strokeLinecap="round" />
      <motion.path d="M 18 74 A 52 52 0 0 1 122 74" fill="none" stroke={riskColor[level]} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      <text x="70" y="66" textAnchor="middle" className="fill-fg" style={{ fontSize: 26, fontWeight: 600 }}>{score}</text>
      <text x="70" y="80" textAnchor="middle" className="fill-faint" style={{ fontSize: 8 }}>of 100</text>
    </svg>
  )
}

/* ------------------------------------------------------------------ progress (learning loop step 4) */
function ProgressNotes({ d }: { d: Decision }) {
  const { toast, refresh } = useApp()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true)
    try { await api.addProgress(d.id, note.trim()); setNote(''); toast('memory', 'Progress note retained', 'Future premortems can recall it'); refresh() }
    catch (e) { toast('error', 'Could not save the note', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Card className="p-6">
      <div className="text-sm font-medium">Implementation progress</div>
      <p className="mb-4 mt-0.5 text-xs text-sub">Record surprises while the work is in flight, like a broken assumption or a scope change. Each note is retained to memory straight away.</p>
      {(d.progress || []).length > 0 && (
        <ol className="mb-4 space-y-2 border-l border-line pl-4">
          {d.progress!.map((p, i) => <li key={i} className="text-sm"><span className="mr-2 text-2xs text-faint">{fmtDate(p.at)}</span>{p.note}</li>)}
        </ol>
      )}
      <div className="flex gap-2">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && note.trim().length > 2 && add()} placeholder="e.g. Citus needs a distribution column on 14 tables — schema changes after all" />
        <Button variant="secondary" loading={busy} disabled={note.trim().length < 3} onClick={add}>Add note</Button>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ outcome */
function OutcomeForm({ d }: { d: Decision }) {
  const { toast, refresh } = useApp()
  const [actual, setActual] = useState(String(d.estimate_weeks ? d.estimate_weeks * 2 : 4))
  const [asm, setAsm] = useState(d.assumptions.map((a) => ({ text: a.text, held: true, note: '' })))
  const [risks, setRisks] = useState(d.risks.map((r) => ({ raised_by: r.raised_by, text: r.text, addressed: false, materialized: false })))
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [learned, setLearned] = useState<Awaited<ReturnType<typeof api.logOutcome>>['learning'] | null>(null)

  const submit = async () => {
    setBusy(true)
    try {
      const r = await api.logOutcome(d.id, { actual_weeks: Number(actual), assumptions: asm, risks, outcome_summary: summary })
      setLearned(r.learning)
      toast('memory', `Outcome of ${d.id} retained`, 'Calibration and lesson confidence updated')
    } catch (e) { toast('error', 'Could not log the outcome', (e as Error).message) } finally { setBusy(false) }
  }
  if (learned) return (
    <Card className="p-6">
      <div className="flex items-center gap-2 text-sm font-medium"><BrainCircuit className="h-4 w-4 text-memory" />What NEXUS learned from {d.id}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Delta label={`${learned.category} estimate factor`} before={learned.factor_before} after={learned.factor_after} suffix="x" />
        <Delta label="Team-wide estimate factor" before={learned.team_before} after={learned.team_after} suffix="x" />
      </div>
      <div className="mt-4 space-y-2">
        {learned.lessons_changed.map((l) => (
          <div key={l.lesson} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg/40 px-3 py-2 text-xs">
            <span>{l.lesson}</span><span className="tnum shrink-0 text-sub">{l.before != null ? `${Math.round(l.before * 100)}%` : 'new'} → <span className="text-memory-fg">{Math.round(l.after * 100)}%</span></span>
          </div>
        ))}
      </div>
      <Button className="mt-5" variant="primary" onClick={refresh}>Done</Button>
    </Card>
  )
  return (
    <Card className="p-6">
      <div className="mb-1 text-sm font-medium">Outcome feedback</div>
      <p className="mb-5 text-xs text-sub">This closes the loop: the outcome is retained to Hindsight and every future premortem uses it.</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Field label="Actual effort (weeks)"><input className="input" type="number" min="0.5" step="0.5" value={actual} onChange={(e) => setActual(e.target.value)} /></Field>
          <Field label="What happened"><textarea className="input min-h-[96px]" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Shipped late because…" /></Field>
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <div className="label mb-2">Did the assumptions hold?</div>
            {asm.length ? asm.map((a, i) => (
              <div key={i} className="mb-2 rounded-lg border border-line bg-bg/40 p-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{a.text}</span>
                  <Segmented value={a.held ? 'held' : 'broke'} onChange={(v) => setAsm(asm.map((x, j) => j === i ? { ...x, held: v === 'held' } : x))}
                    options={[{ value: 'held', label: 'Held' }, { value: 'broke', label: 'Broke' }]} />
                </div>
                {!a.held && <input className="input mt-2" placeholder="What broke?" value={a.note} onChange={(e) => setAsm(asm.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />}
              </div>
            )) : <p className="text-xs text-sub">No assumptions recorded.</p>}
          </div>
          {risks.length > 0 && <div>
            <div className="label mb-2">Raised risks</div>
            {risks.map((r, i) => (
              <div key={i} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-bg/40 p-2.5 text-sm">
                <span>{r.text}</span>
                <div className="flex gap-3 text-xs text-sub">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.addressed} onChange={(e) => setRisks(risks.map((x, j) => j === i ? { ...x, addressed: e.target.checked } : x))} />Addressed</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.materialized} onChange={(e) => setRisks(risks.map((x, j) => j === i ? { ...x, materialized: e.target.checked } : x))} />It happened</label>
                </div>
              </div>
            ))}
          </div>}
        </div>
      </div>
      <div className="mt-5 flex justify-end"><Button variant="memory" loading={busy} disabled={!(Number(actual) > 0)} onClick={submit}>Save outcome to memory</Button></div>
    </Card>
  )
}

function Delta({ label, before, after, suffix }: { label: string; before: number | null; after: number; suffix: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/40 p-3">
      <div className="text-2xs text-faint">{label}</div>
      <div className="tnum mt-1 text-lg font-semibold">{before ?? '—'}{suffix} <span className="text-faint">→</span> <span className="text-memory-fg">{after}{suffix}</span></div>
    </div>
  )
}

function OutcomeView({ d }: { d: Decision }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5">
        <div className="text-xs text-sub">Estimated vs actual</div>
        <div className="tnum mt-2 text-3xl font-semibold">{d.estimate_weeks}w → {d.actual_weeks}w</div>
        <div className="mt-1 text-sm text-sub">{d.ratio ?? (d.actual_weeks! / d.estimate_weeks!).toFixed(2)}x the estimate · closed {fmtDate(d.closed_at)}</div>
        {d.outcome_summary && <p className="mt-4 text-sm">{d.outcome_summary}</p>}
        {d.linked_incidents.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-sub">Led to {d.linked_incidents.map((i) => <Ref key={i} id={i} />)}</div>}
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Assumptions and risks, in hindsight" />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-2">{d.assumptions.map((a) => (
            <div key={a.text} className="flex gap-2 text-sm">{a.held ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-crit" />}<div>{a.text}{a.note && <div className="text-xs text-sub">{a.note}</div>}</div></div>
          ))}</div>
          <div className="space-y-2">{d.risks.map((r) => (
            <div key={r.text} className="text-sm"><span className="font-medium">{r.raised_by}:</span> {r.text}
              <div className="mt-1 flex gap-1.5">{r.addressed ? <Badge tone="green">addressed</Badge> : <Badge tone="amber">ignored</Badge>}{r.materialized && <Badge tone="red">happened</Badge>}</div></div>
          ))}{!d.risks.length && <p className="text-sm text-sub">No risks were raised.</p>}</div>
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ replay */
function Replay({ id }: { id: string }) {
  const { data, error, loading, reload } = useAsync(() => api.replay(id), [id])
  if (loading) return <Card><LoadingBlock rows={6} label="Replaying with only the memories that existed on the proposal date" /></Card>
  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>
  if (!data) return null
  const n = data.nexus_at_the_time, a = data.what_actually_happened
  const caught = data.would_have_caught
  return (
    <div className="min-w-0 space-y-4">
      <Card className={cn('flex flex-col gap-2 p-5 sm:flex-row sm:items-center', caught.length ? 'border-memory/40' : '')}>
        <History className="h-5 w-5 shrink-0 text-memory" />
        <div className="flex-1 text-sm">{caught.length
          ? <>Using only memories from before {fmtDate(data.decision.proposed_at)}, NEXUS would have caught: <b>{caught.join(', ')}</b>.</>
          : <>There wasn't enough history on {fmtDate(data.decision.proposed_at)} to predict what happened.</>}</div>
        <RiskBadge level={n.risk.level} score={n.risk.score} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`What NEXUS would have said on ${fmtDate(data.decision.proposed_at)}`} icon={<BrainCircuit className="h-4 w-4 text-memory" />}
            subtitle={n.corrected_estimate ? `Estimate ${n.corrected_estimate.raw_estimate_weeks}w → ${n.corrected_estimate.corrected_weeks}w` : 'No estimate history yet'} />
          <div className="space-y-2 p-5">{n.warnings.length ? n.warnings.map((w, i) => <EvidenceCard key={w.title} w={w} index={i} />) : <p className="text-sm text-sub">No warnings — memory was too thin.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="What actually happened" subtitle={`Took ${a.actual_weeks}w against ${a.estimate_weeks}w`} />
          <div className="space-y-3 p-5 text-sm">
            {a.broken_assumptions.map((x) => <div key={x.text} className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-crit" /><div>{x.text}<div className="text-xs text-sub">{x.note}</div></div></div>)}
            {a.ignored_risks.map((x) => <div key={x.text} className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" /><div><span className="font-medium">{x.raised_by}</span> warned: {x.text}<div className="text-xs text-sub">ignored</div></div></div>)}
            {a.incidents.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs text-sub">Incidents: {a.incidents.map((i) => <Ref key={i} id={i} />)}</div>}
            {a.outcome_summary && <p className="text-sub">{a.outcome_summary}</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
