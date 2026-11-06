import { motion } from 'framer-motion'
import { AlertOctagon, ArrowLeft, BrainCircuit, CheckCircle2, CircleDot, FileWarning, GitBranch, Loader2, Microscope, Plus, ShieldCheck, Trash2, Wrench, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, ChartTooltip, Legend, axis } from '@/charts/theme'
import { ConflictPanel } from '@/components/memory/ConflictPanel'
import { MemoryItem } from '@/components/memory/Evidence'
import { Badge, Button, Card, CardHeader, ErrorState, Field, LoadingBlock, Ref, Segmented, SeverityBadge, SourceBadge } from '@/components/ui'
import { cn, fmtDate, fmtTime } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { FixResult, Incident, Investigation } from '@/types'

export default function IncidentDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { version } = useApp()
  const inc = useAsync(() => api.incident(id), [id, version])
  const ana = useAsync(() => api.analyzeIncident(id), [id, version])
  const i = inc.data
  if (inc.loading && !i) return <Card><LoadingBlock rows={8} label={`Loading ${id}`} /></Card>
  if (inc.error) return <Card><ErrorState error={inc.error} onRetry={inc.reload} /></Card>
  if (!i) return null
  const w = ana.data?.with_memory
  return (
    <div>
      <button onClick={() => nav('/incidents')} className="mb-4 inline-flex items-center gap-1.5 text-xs text-sub hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" />Incident Intelligence</button>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-sub">
          <span className="font-mono">{i.id}</span><SeverityBadge sev={i.severity} /><Badge>{i.service}</Badge>
          <Badge tone={i.status === 'resolved' ? 'green' : 'amber'}>{i.status === 'resolved' ? 'Resolved' : 'Open'}</Badge>
          <span>{fmtDate(i.date)}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{i.title}</h1>
        {i.status === 'resolved' && <p className="mt-1.5 text-sm text-sub">Investigation below uses only memories from before this incident, so you can see what RECALL-X would have said at the time.</p>}
      </div>

      {w && w.failed_fix_warnings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-start gap-3 rounded-xl border border-crit/40 bg-crit-soft/50 p-4">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-crit" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-crit-fg">Don't repeat these fixes — they failed or only bought time before</div>
            <ul className="mt-1.5 space-y-1 text-sm">
              {w.failed_fix_warnings.slice(0, 3).map((f) => (
                <li key={f.action} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.action}</span>
                  <span className="text-xs text-sub">tried {f.tried}x · {f.failed} failed · {f.temporary} temporary{f.avg_lasted_days != null ? ` (lasted ~${f.avg_lasted_days} days)` : ''}</span>
                  {f.events.slice(0, 4).map((e) => <Ref key={e.incident + f.action} id={e.incident} />)}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <Investigation_ state={ana} />
          {w?.conflicts && w.conflicts.length > 0 && (
            <div className="space-y-3">{w.conflicts.map((c) => <ConflictPanel key={c.id} c={c} compact />)}</div>
          )}
          {w && <FixHistory w={w} />}
          {w && w.evidence.length > 0 && (
            <Card>
              <CardHeader title="Memories recalled" subtitle="What Hindsight returned for this investigation" icon={<BrainCircuit className="h-4 w-4 text-memory" />} />
              <div className="grid gap-2 p-5 md:grid-cols-2">{w.evidence.slice(0, 8).map((m, k) => <MemoryItem key={m.id || k} m={m} />)}</div>
            </Card>
          )}
        </div>
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Error logs" icon={<FileWarning className="h-4 w-4" />} />
            <pre className="m-5 mt-3 max-h-56 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-2xs leading-relaxed text-sub">
              {(i.logs?.length ? i.logs : [i.error_signature]).map((l, k) => <div key={k} className={cn(/error|fatal/i.test(l) && 'text-crit-fg')}>{l}</div>)}
            </pre>
          </Card>
          <Card>
            <CardHeader title="Incident timeline" icon={<CircleDot className="h-4 w-4" />} />
            <ol className="relative mx-5 mb-5 mt-4 border-l border-line">
              {(i.timeline || []).map((t, k) => (
                <li key={k} className="relative pb-3.5 pl-5 last:pb-0">
                  <span className={cn('absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-panel',
                    t.kind === 'resolved' || t.kind === 'fix-resolved' ? 'bg-ok' : t.kind === 'fix-failed' ? 'bg-crit' : t.kind === 'fix-temporary' ? 'bg-warn' : 'bg-primary')} />
                  <div className="text-2xs text-faint">{t.at.length > 10 ? fmtTime(t.at) : fmtDate(t.at)}{t.kind.startsWith('fix-') && ` · ${t.kind.slice(4)}`}</div>
                  <div className="text-xs">{t.event}</div>
                </li>
              ))}
              {!(i.timeline || []).length && <li className="pl-5 text-xs text-sub">No timeline events yet.</li>}
            </ol>
          </Card>
          <FixCheck i={i} />
          {i.status === 'open' ? <Feedback i={i} w={w} /> : <ResolvedSummary i={i} />}
        </div>
      </div>
    </div>
  )
}

function Investigation_({ state }: { state: { data: { with_memory: Investigation; without_memory?: { hypothesis: string; recommended_actions: { action: string; why: string }[] } } | null; loading: boolean; error: Error | null; reload: () => void } }) {
  const [view, setView] = useState<'memory' | 'compare'>('memory')
  if (state.loading) return (
    <Card className="p-6"><div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin text-memory" />Recalling similar incidents, failed fixes and related decisions…</div><LoadingBlock rows={5} /></Card>
  )
  if (state.error) return <Card><ErrorState error={state.error} onRetry={state.reload} /></Card>
  if (!state.data) return null
  const w = state.data.with_memory, g = state.data.without_memory
  return (
    <Card>
      <CardHeader title="AI investigation" icon={<Microscope className="h-4 w-4 text-memory" />}
        subtitle={<span className="flex items-center gap-2"><SourceBadge source={w.memory_stats.memory_mode} />{w.memory_stats.recalled} memories recalled</span>}
        action={<Segmented value={view} onChange={setView} options={[{ value: 'memory', label: 'With memory' }, { value: 'compare', label: 'Compare' }]} />} />
      <div className="p-5">
        {view === 'compare' && g ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-bg/40 p-4">
              <div className="mb-2 text-xs font-medium text-sub">Without memory</div>
              <p className="text-sm text-sub">{g.hypothesis}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm text-fg/80">{g.recommended_actions.map((a) => <li key={a.action}>{a.action}</li>)}</ol>
            </div>
            <div className="rounded-lg border border-memory/30 bg-memory-soft/15 p-4">
              <div className="mb-2 text-xs font-medium text-memory-fg">With incident memory</div>
              <p className="text-sm">{w.hypothesis}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm">{w.recommended_actions.map((a) => <li key={a.action}>{a.action}</li>)}</ol>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="label">Suspected root cause</div>
              <p className="mt-1 text-sm">{w.hypothesis}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label mb-2 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-ok" />Recommended resolution</div>
                {w.recommended_actions.length ? w.recommended_actions.map((a) => (
                  <div key={a.action} className="mb-2 rounded-lg border border-ok/25 bg-ok-soft/40 p-3">
                    <div className="text-sm font-medium">{a.action}</div><div className="mt-0.5 text-xs text-sub">{a.why}</div>
                    {a.evidence && <div className="mt-1.5 flex flex-wrap gap-1">{a.evidence.map((e) => <Ref key={e} id={e} />)}</div>}
                  </div>
                )) : <p className="text-xs text-sub">No proven fix in memory for this pattern yet.</p>}
              </div>
              <div>
                <div className="label mb-2 flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5 text-crit" />Avoid</div>
                {w.avoid.length ? w.avoid.map((a) => (
                  <div key={a.action} className="mb-2 rounded-lg border border-crit/25 bg-crit-soft/40 p-3">
                    <div className="text-sm font-medium">{a.action}</div><div className="mt-0.5 text-xs text-sub">{a.why}</div>
                    {a.evidence && <div className="mt-1.5 flex flex-wrap gap-1">{a.evidence.map((e) => <Ref key={e} id={e} />)}</div>}
                  </div>
                )) : <p className="text-xs text-sub">Nothing on record that failed for this pattern.</p>}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label mb-2">Similar historical incidents</div>
                {w.similar_incidents.length ? w.similar_incidents.map((s) => (
                  <div key={s.id} className="mb-1.5 flex items-start gap-2 text-xs"><Ref id={s.id} /><div><div>{s.title}</div><div className="text-faint">{s.root_cause}</div></div></div>
                )) : <p className="text-xs text-sub">First incident of this kind.</p>}
              </div>
              <div>
                <div className="label mb-2 flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" />Decisions that may have set this up</div>
                {w.suspect_decisions.length ? w.suspect_decisions.map((d) => (
                  <div key={d.id} className="mb-2 text-xs"><div className="flex items-center gap-2"><Ref id={d.id} /><span>{d.title}</span></div>
                    <div className="mt-0.5 text-faint">{d.reason}{d.ignored_risks[0] && <> · ignored warning: “{d.ignored_risks[0]}”</>}</div></div>
                )) : <p className="text-xs text-sub">No linked decision found.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function FixHistory({ w }: { w: Investigation }) {
  const data = w.fix_decay.map((f) => ({ ...f, name: f.action.length > 30 ? f.action.slice(0, 28) + '…' : f.action }))
  if (!data.length) return null
  return (
    <Card>
      <CardHeader title="Previously attempted fixes" subtitle="Every fix tried on similar incidents and what happened" icon={<Wrench className="h-4 w-4" />} />
      <div className="px-3 pb-4 pt-3">
        <ResponsiveContainer width="100%" height={Math.max(150, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke={C.grid} />
            <XAxis type="number" allowDecimals={false} {...axis} />
            <YAxis type="category" dataKey="name" width={200} {...axis} tick={{ fill: '#97a3b8', fontSize: 11 }} />
            <Tooltip content={<ChartTooltip fmt={(v, n, p) => (n === 'Temporary' && (p as { avg_lasted_days?: number }).avg_lasted_days != null ? `${v} · lasted ~${(p as { avg_lasted_days?: number }).avg_lasted_days}d` : String(v))}
              labelFmt={(l, p) => (p as { action?: string })?.action ?? l} />} />
            <Bar name="Resolved" dataKey="resolved" stackId="a" fill={C.green} />
            <Bar name="Temporary" dataKey="temporary" stackId="a" fill={C.amber} />
            <Bar name="Failed" dataKey="failed" stackId="a" fill={C.red} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <Legend items={[{ label: 'Resolved it', color: C.green }, { label: 'Worked temporarily', color: C.amber }, { label: 'Failed', color: C.red }]} />
      </div>
    </Card>
  )
}

/** Type a fix you're about to try; RECALL-X checks it against history and warns loudly if it failed before. */
function FixCheck({ i }: { i: Incident }) {
  const { team } = useApp()
  const [action, setAction] = useState('')
  const [res, setRes] = useState<Awaited<ReturnType<typeof api.checkFix>> | null>(null)
  const [busy, setBusy] = useState(false)
  const check = async () => {
    setBusy(true)
    try { setRes(await api.checkFix(team, i.service, action)) } catch (e) { setRes({ warning: false, message: (e as Error).message, matches: [] }) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader title="Check a fix before you try it" subtitle="RECALL-X compares it with every fix tried on this service" icon={<Wrench className="h-4 w-4" />} />
      <div className="space-y-3 p-5 pt-3">
        <div className="flex gap-2">
          <input className="input" value={action} onChange={(e) => { setAction(e.target.value); setRes(null) }} onKeyDown={(e) => e.key === 'Enter' && action.length > 2 && check()} placeholder="e.g. restart the pods" />
          <Button variant="secondary" loading={busy} disabled={action.length < 3} onClick={check}>Check</Button>
        </div>
        <div className="flex flex-wrap gap-1.5">{['Restart the pods', 'Increase max pool size', 'Scale out replicas'].map((s) => (
          <button key={s} onClick={() => { setAction(s); setRes(null) }} className="rounded-md border border-line2 px-2 py-0.5 text-2xs text-sub hover:text-fg">{s}</button>))}</div>
        {res && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
            className={cn('rounded-lg border p-3 text-sm', res.warning ? 'border-crit/50 bg-crit-soft/60' : res.matches.length ? 'border-ok/30 bg-ok-soft/50' : 'border-line bg-bg/40')}>
            <div className={cn('flex items-center gap-2 font-semibold', res.warning ? 'text-crit-fg' : res.matches.length ? 'text-ok-fg' : 'text-sub')}>
              {res.warning ? <AlertOctagon className="h-4 w-4" /> : res.matches.length ? <CheckCircle2 className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
              {res.warning ? 'This fix failed before' : res.matches.length ? 'This fix has worked before' : 'No history for this fix'}
            </div>
            <p className="mt-1 text-xs text-sub">{res.message}</p>
            {res.matches[0] && <div className="mt-2 flex flex-wrap gap-1">{res.matches[0].events.map((e) => <Ref key={e.incident} id={e.incident} />)}</div>}
          </motion.div>
        )}
      </div>
    </Card>
  )
}

function Feedback({ i, w }: { i: Incident; w?: Investigation }) {
  const { toast, refresh } = useApp()
  const [fixes, setFixes] = useState<{ action: string; result: FixResult; lasted_days: string }[]>([{ action: w?.recommended_actions[0]?.action || '', result: 'resolved', lasted_days: '' }])
  const [rc, setRc] = useState('')
  const [ttr, setTtr] = useState('45')
  const [busy, setBusy] = useState(false)
  const suggested = w?.recommended_actions[0]?.action
  // the investigation usually finishes after this form mounts; prefill the proven fix once it arrives
  useEffect(() => {
    if (suggested) setFixes((fs) => (fs.length === 1 && !fs[0].action ? [{ ...fs[0], action: suggested }] : fs))
  }, [suggested])
  const submit = async () => {
    setBusy(true)
    try {
      await api.resolveIncident(i.id, {
        attempted_fixes: fixes.filter((f) => f.action.trim()).map((f) => ({ action: f.action, result: f.result, lasted_days: f.lasted_days ? Number(f.lasted_days) : null })),
        root_cause: rc || 'see resolution', resolution: fixes.find((f) => f.result === 'resolved')?.action || fixes[0].action,
        linked_decision: w?.suspect_decisions[0]?.id || null, ttr_minutes: Number(ttr) || null,
      })
      toast('memory', `${i.id} resolved and retained`, 'The next investigation will count these fixes')
      refresh()
    } catch (e) { toast('error', 'Could not save feedback', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader title="Engineer feedback" subtitle="Record what you tried. It's retained to memory." icon={<CheckCircle2 className="h-4 w-4 text-ok" />} />
      <div className="space-y-3 p-5 pt-3">
        {fixes.map((f, k) => (
          <div key={k} className="space-y-2 rounded-lg border border-line bg-bg/40 p-2.5">
            <div className="flex gap-2">
              <input className="input" value={f.action} placeholder="Fix applied" onChange={(e) => setFixes(fixes.map((x, j) => j === k ? { ...x, action: e.target.value } : x))} />
              {fixes.length > 1 && <Button size="sm" variant="ghost" aria-label="Remove" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setFixes(fixes.filter((_, j) => j !== k))} />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented value={f.result} onChange={(v) => setFixes(fixes.map((x, j) => j === k ? { ...x, result: v } : x))}
                options={[{ value: 'resolved', label: 'Resolved' }, { value: 'temporary', label: 'Temporary' }, { value: 'failed', label: 'Failed' }]} />
              {f.result === 'temporary' && <input className="input h-8 w-28" type="number" min="0" placeholder="lasted days" value={f.lasted_days} onChange={(e) => setFixes(fixes.map((x, j) => j === k ? { ...x, lasted_days: e.target.value } : x))} />}
            </div>
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setFixes([...fixes, { action: '', result: 'failed', lasted_days: '' }])}>Add another fix</Button>
        <Field label="Root cause"><input className="input" value={rc} onChange={(e) => setRc(e.target.value)} placeholder="What actually caused it?" /></Field>
        <Field label="Time to resolve (minutes)"><input className="input" type="number" min="1" value={ttr} onChange={(e) => setTtr(e.target.value)} /></Field>
        <Button variant="memory" className="w-full" loading={busy} disabled={!fixes.some((f) => f.action.trim())} onClick={submit}>Resolve and retain to memory</Button>
      </div>
    </Card>
  )
}

function ResolvedSummary({ i }: { i: Incident }) {
  return (
    <Card>
      <CardHeader title="How it was resolved" icon={<CheckCircle2 className="h-4 w-4 text-ok" />} subtitle={i.ttr_minutes ? `${i.ttr_minutes} minutes to resolve` : undefined} />
      <div className="space-y-2 p-5 pt-3 text-sm">
        {i.attempted_fixes.map((f) => (
          <div key={f.action} className="flex items-center justify-between gap-2"><span>{f.action}</span>
            <Badge tone={f.result === 'resolved' ? 'green' : f.result === 'temporary' ? 'amber' : 'red'}>{f.result}</Badge></div>
        ))}
        {i.root_cause && <p className="pt-2 text-xs text-sub"><span className="text-fg">Root cause:</span> {i.root_cause}</p>}
        {i.linked_decision && <div className="flex items-center gap-2 pt-1 text-xs text-sub">Traced to <Ref id={i.linked_decision} /></div>}
      </div>
    </Card>
  )
}
