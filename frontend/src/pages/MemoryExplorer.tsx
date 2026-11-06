import { Markdown } from '@/components/ui/Markdown'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, BrainCircuit, ChevronDown, Database, Link2, RefreshCw, Search, Sparkles, Waypoints } from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, ChartTooltip, axis } from '@/charts/theme'
import { MemoryItem } from '@/components/memory/Evidence'
import { Badge, Button, Card, CardHeader, Confidence, EmptyState, ErrorState, LoadingBlock, PageHeader, Ref, Segmented, SourceBadge } from '@/components/ui'
import { cn, fmtDate, fmtTime } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { Memory, MemoryOp } from '@/types'

const RECALL_PRESETS: { label: string; query: string; tags?: string[] }[] = [
  { label: 'Similar decisions', query: 'Kafka migration with schema and rollback concerns', tags: ['kind:decision', 'kind:outcome'] },
  { label: 'Historical incidents', query: 'database connection pool timeouts on payment-gateway', tags: ['kind:incident'] },
  { label: 'Failed fixes', query: 'fixes that failed or only worked temporarily', tags: ['fix:temporary', 'fix:failed'] },
  { label: 'Previous lessons', query: 'assumptions that broke and warnings that were ignored', tags: ['assumption:broken', 'risk:ignored'] },
]
const REFLECT_PRESETS = [
  'What patterns keep repeating in how this team plans and ships work?',
  'What are this team\'s engineering blind spots? Cite decision and incident IDs.',
  'Which fixes should on-call stop reaching for first, and why?',
]

export default function MemoryExplorer() {
  const { team, version, health } = useApp()
  const stats = useAsync(() => api.memoryStats(team), [team, version])
  const lessons = useAsync(() => api.lessons(team), [team, version])
  const mode = health?.memory_mode || 'hindsight'
  return (
    <div>
      <PageHeader title="Memory Explorer" description="See exactly what NEXUS remembers, what it pulls back for each decision and incident, and what it has learned."
        meta={<><SourceBadge source={mode} /><Badge icon={<Database className="h-3 w-3" />}>bank {stats.data?.bank || `nexus-${team}`}</Badge></>} />
      {mode !== 'hindsight' && (
        <Card className="mb-4 flex items-start gap-3 border-warn/30 bg-warn-soft/30 p-4 text-sm">
          <Database className="mt-0.5 h-4 w-4 text-warn" />
          <div><div className="font-medium text-warn-fg">Running on the local fallback store</div>
            <div className="text-xs text-sub">Set HINDSIGHT_URL and HINDSIGHT_API_KEY in backend/.env to use the Hindsight API. Every operation below is labelled with where it actually ran.</div></div>
        </Card>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <RetainCard stats={stats.data} loading={stats.loading} />
        <RecallCard />
        <ReflectCard patterns={stats.data?.patterns} reflectCount={stats.data?.ops.reflect || 0} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
        <ActivityFeed />
        <Card>
          <CardHeader title="Evolving lessons" subtitle="Confidence moves as each outcome confirms or contradicts a lesson" icon={<Sparkles className="h-4 w-4 text-memory" />} />
          {lessons.loading && <LoadingBlock rows={6} />}
          {lessons.error && <ErrorState error={lessons.error} onRetry={lessons.reload} />}
          <div className="divide-y divide-line">
            {lessons.data?.lessons.map((l) => <LessonRow key={l.id} l={l} />)}
          </div>
        </Card>
      </div>
    </div>
  )
}

function OpCard({ icon, title, sub, children, tone }: { icon: ReactNode; title: string; sub: string; children: ReactNode; tone: string }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 px-5 pt-5">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tone)}>{icon}</span>
        <div><div className="text-sm font-semibold tracking-wide">{title}</div><div className="text-xs text-sub">{sub}</div></div>
      </div>
      <div className="flex-1 p-5">{children}</div>
    </Card>
  )
}

function RetainCard({ stats, loading }: { stats: Awaited<ReturnType<typeof api.memoryStats>> | null; loading: boolean }) {
  const rows: [string, string][] = [['decisions', 'Decisions'], ['assumptions', 'Assumptions'], ['incidents', 'Incidents'], ['resolutions', 'Resolutions'], ['outcomes', 'Outcomes']]
  return (
    <OpCard icon={<Archive className="h-4 w-4" />} title="RETAIN" sub="What NEXUS has stored" tone="bg-primary-soft/60 text-primary">
      {loading ? <LoadingBlock rows={5} /> : stats && (
        <>
          <div className="space-y-2">
            {rows.map(([k, label]) => (
              <div key={k} className="flex items-center justify-between text-sm"><span className="text-sub">{label}</span><span className="tnum font-medium">{stats.retained[k] ?? 0}</span></div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-line bg-bg/40 p-3 text-2xs text-sub">
            Each record is retained with a <span className="font-mono text-fg">document_id</span> (e.g. D-0112:outcome) and tags like <span className="font-mono text-fg">assumption:broken</span>, <span className="font-mono text-fg">fix:temporary</span>, so recall can target them and every result traces back to its source.
          </div>
          <div className="mt-3 text-2xs text-faint">{(stats.ops.retain || 0) + (stats.ops.retain_batch || 0)} retain calls logged</div>
        </>
      )}
    </OpCard>
  )
}

function RecallCard() {
  const { team } = useApp()
  const [q, setQ] = useState(RECALL_PRESETS[0].query)
  const [tags, setTags] = useState<string[] | undefined>(RECALL_PRESETS[0].tags)
  const [res, setRes] = useState<{ source: string; results: Memory[]; error?: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Error | null>(null)
  const run = async (query = q, t = tags) => {
    setBusy(true); setErr(null)
    try { setRes(await api.recall(team, query, t)) } catch (e) { setErr(e as Error) } finally { setBusy(false) }
  }
  return (
    <OpCard icon={<Search className="h-4 w-4" />} title="RECALL" sub="Ask the memory bank directly" tone="bg-memory-soft/70 text-memory">
      <div className="flex flex-wrap gap-1.5">
        {RECALL_PRESETS.map((p) => (
          <button key={p.label} onClick={() => { setQ(p.query); setTags(p.tags); run(p.query, p.tags) }}
            className="rounded-md border border-line2 px-2 py-1 text-2xs text-sub hover:border-memory/50 hover:text-fg">{p.label}</button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setTags(undefined) }} onKeyDown={(e) => e.key === 'Enter' && run()} aria-label="Recall query" />
        <Button variant="memory" loading={busy} onClick={() => run()}>Recall</Button>
      </div>
      {tags && <div className="mt-2 font-mono text-2xs text-faint">tags: {tags.join(', ')}</div>}
      {err && <div className="mt-3"><ErrorState error={err} /></div>}
      {res && (
        <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
          <div className="flex items-center justify-between text-2xs text-sub"><span>{res.results.length} memories</span><SourceBadge source={res.source} /></div>
          {res.error && <p className="rounded-md border border-crit/30 bg-crit-soft/40 p-2 text-xs text-crit-fg">Hindsight recall failed: {res.error}</p>}
          {res.results.length ? res.results.map((m, i) => <MemoryItem key={m.id || i} m={m} />) : !res.error && <p className="text-xs text-sub">Nothing matched.</p>}
        </div>
      )}
      {!res && !busy && <p className="mt-3 text-xs text-sub">Pick a preset or type a question. Results come straight from recall, with the record each memory came from.</p>}
    </OpCard>
  )
}

function ReflectCard({ patterns, reflectCount }: { patterns?: number; reflectCount: number }) {
  const { team, toast } = useApp()
  const [q, setQ] = useState(REFLECT_PRESETS[0])
  const [res, setRes] = useState<Awaited<ReturnType<typeof api.reflect>> | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const r = await api.reflect(team, q)
      setRes(r)
      if (r.available) toast('memory', 'Reflection generated', 'Logged in the memory activity feed')
    } catch (e) { toast('error', 'Reflect failed', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <OpCard icon={<Waypoints className="h-4 w-4" />} title="REFLECT" sub="Patterns, blind spots, evolving lessons" tone="bg-ok-soft text-ok">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-line bg-bg/40 p-3"><div className="tnum text-xl font-semibold">{patterns ?? '—'}</div><div className="text-2xs text-sub">recurring patterns</div></div>
        <div className="rounded-lg border border-line bg-bg/40 p-3"><div className="tnum text-xl font-semibold">{reflectCount}</div><div className="text-2xs text-sub">reflections run</div></div>
      </div>
      <select className="input mt-3 text-xs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Reflection question">
        {REFLECT_PRESETS.map((p) => <option key={p}>{p}</option>)}
      </select>
      <Button variant="secondary" className="mt-2 w-full" loading={busy} icon={<Sparkles className="h-4 w-4" />} onClick={run}>Reflect on memory</Button>
      {res && (
        <div className={cn('mt-3 rounded-lg border p-3 text-xs', res.available ? 'border-memory/25 bg-memory-soft/20' : 'border-warn/30 bg-warn-soft/30')}>
          <div className="mb-1.5 flex justify-end"><SourceBadge source={res.source} /></div>
          <Markdown text={res.text || res.message || ''} className="max-h-[220px] overflow-y-auto text-sub" />
          {res.text && <div className="mt-2 flex flex-wrap gap-1">{[...new Set(res.text.match(/\b(D|INC)-\d{4}\b/g) || [])].map((r) => <Ref key={r} id={r} />)}</div>}
        </div>
      )}
    </OpCard>
  )
}

/* ------------------------------------------------------------------ activity feed */
type FeedItem = { key: string; at: string; kind: string; title: string; detail: string; source: string; op?: MemoryOp }

function ActivityFeed() {
  const { team, version } = useApp()
  const ops = useAsync(() => api.memoryActivity(team, 120), [team, version])
  const incs = useAsync(() => api.incidents(team), [team, version])
  const [filter, setFilter] = useState<'all' | 'retain' | 'recall' | 'reflect' | 'links'>('all')
  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = []
    for (const o of ops.data || []) {
      if (o.op === 'retain' || o.op === 'retain_batch')
        out.push({ key: `o${o.seq}`, at: o.at, kind: 'retain', source: o.source, op: o,
          title: o.op === 'retain_batch' ? `${o.count} memories retained` : `Memory retained · ${o.document_id}`, detail: o.context || '' })
      else if (o.op === 'recall') {
        out.push({ key: `o${o.seq}`, at: o.at, kind: 'recall', source: o.source, op: o, title: `Memory recalled · ${o.results} results`, detail: `${o.purpose ? o.purpose + ' · ' : ''}“${o.query}”` })
        if (o.refs?.some((r) => r.startsWith('D-')) && o.purpose?.includes('premortem'))
          out.push({ key: `r${o.seq}`, at: o.at, kind: 'related', source: o.source, op: o, title: 'Related decision found', detail: o.refs.filter((r) => r.startsWith('D-')).slice(0, 4).join(', ') })
      } else if (o.op === 'reflect')
        out.push({ key: `o${o.seq}`, at: o.at, kind: 'reflect', source: o.source, op: o, title: 'Reflection generated', detail: o.query || '' })
    }
    for (const i of incs.data || []) if (i.linked_decision)
      out.push({ key: `l${i.id}`, at: i.date, kind: 'link', source: 'seed', title: `Incident ${i.id} linked to decision ${i.linked_decision}`, detail: i.title })
    return out.sort((a, b) => b.at.localeCompare(a.at))
  }, [ops.data, incs.data])
  const shown = items.filter((i) => filter === 'all' || (filter === 'links' ? i.kind === 'link' || i.kind === 'related' : i.kind === filter)).slice(0, 60)
  return (
    <Card>
      <CardHeader title="Memory activity" subtitle="Every retain, recall and reflect call, and where it actually ran" icon={<BrainCircuit className="h-4 w-4 text-memory" />}
        action={<Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => { ops.reload(); incs.reload() }}>Refresh</Button>} />
      <div className="px-5 pt-3"><Segmented value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'All' }, { value: 'retain', label: 'Retained' }, { value: 'recall', label: 'Recalled' }, { value: 'reflect', label: 'Reflections' }, { value: 'links', label: 'Links' }]} /></div>
      {ops.loading && <LoadingBlock rows={6} />}
      {ops.error && <ErrorState error={ops.error} onRetry={ops.reload} />}
      {!ops.loading && !shown.length && <EmptyState title="No activity of this type yet" body="Run a premortem, an incident investigation or a recall above and it will show up here." />}
      <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
        {shown.map((it) => <FeedRow key={it.key} it={it} />)}
      </ul>
    </Card>
  )
}

const feedIcon: Record<string, ReactNode> = {
  retain: <Archive className="h-3.5 w-3.5 text-primary" />, recall: <Search className="h-3.5 w-3.5 text-memory" />,
  reflect: <Waypoints className="h-3.5 w-3.5 text-ok" />, related: <Link2 className="h-3.5 w-3.5 text-memory" />, link: <Link2 className="h-3.5 w-3.5 text-crit" />,
}

function FeedRow({ it }: { it: FeedItem }) {
  const [open, setOpen] = useState(false)
  const o = it.op
  return (
    <li>
      <button onClick={() => o && setOpen(!open)} className={cn('flex w-full items-start gap-3 px-5 py-3 text-left', o && 'hover:bg-raised/40')} aria-expanded={open}>
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-bg/60">{feedIcon[it.kind]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[13px]"><span className="font-medium">{it.title}</span><SourceBadge source={it.source} /></div>
          <div className="truncate text-xs text-sub">{it.detail}</div>
        </div>
        <div className="shrink-0 text-right text-2xs text-faint">{it.at.length > 10 ? <>{fmtDate(it.at)}<br />{fmtTime(it.at)}</> : fmtDate(it.at)}</div>
        {o && <ChevronDown className={cn('mt-1 h-3.5 w-3.5 shrink-0 text-faint transition-transform', open && 'rotate-180')} />}
      </button>
      <AnimatePresence initial={false}>
        {open && o && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="mx-5 mb-3 space-y-1.5 rounded-lg border border-line bg-bg/60 p-3 font-mono text-2xs text-sub">
              <div><span className="text-faint">operation</span> {o.op} · <span className="text-faint">ran on</span> {o.source} · {o.latency_ms ?? 0} ms</div>
              {o.query && <div><span className="text-faint">query</span> {o.query}</div>}
              {o.tags && <div><span className="text-faint">tags</span> {o.tags.join(', ')}</div>}
              {o.document_id && <div><span className="text-faint">document_id</span> {o.document_id}</div>}
              {o.content && <div className="whitespace-pre-wrap font-sans text-xs">{o.content}</div>}
              {o.text && <div className="whitespace-pre-wrap font-sans text-xs">{o.text}</div>}
              {o.document_ids && <div><span className="text-faint">documents</span> {o.document_ids.slice(0, 12).join(', ')}{o.document_ids.length > 12 && ' …'}</div>}
              {o.refs && o.refs.length > 0 && <div className="flex flex-wrap items-center gap-1 pt-1 font-sans">{o.refs.slice(0, 12).map((r) => <Ref key={r} id={r} />)}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function LessonRow({ l }: { l: { id: string; lesson: string; kind: string; confidence: number; history: { ref: string; confidence: number; event: string; detail: string }[] } }) {
  const [open, setOpen] = useState(false)
  return (
    <Fragment>
      <button className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-raised/40" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="min-w-0 flex-1"><div className="text-[13px] leading-snug">{l.lesson}</div><div className="text-2xs text-faint">{l.history.length} outcomes · {l.kind}</div></div>
        <Confidence value={l.confidence} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={[{ ref: 'prior', confidence: 0.5, event: 'starting belief', detail: '' }, ...l.history]}>
              <XAxis dataKey="ref" {...axis} />
              <YAxis domain={[0, 1]} {...axis} width={30} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
              <Tooltip content={<ChartTooltip fmt={(v, _n, p) => `${Math.round(v * 100)}% · ${(p as { event: string }).event}`} />} />
              <Line dataKey="confidence" name="Confidence" stroke={C.violet} strokeWidth={2} dot={{ r: 3, fill: C.violet }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Fragment>
  )
}
