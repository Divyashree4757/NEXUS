import { Markdown } from '@/components/ui/Markdown'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowRight, ArrowUpRight, BrainCircuit, Info, RefreshCcw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, Confidence, EmptyState, ErrorState, LoadingBlock, PageHeader, Ref, Segmented, SourceBadge } from '@/components/ui'
import { cn, fmtDate } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'

const STEP_LINK: Record<number, string> = { 1: '/decisions?new=1', 2: '/memory', 3: '/decisions', 4: '/decisions', 5: '/incidents', 6: '/decisions', 7: '/memory', 8: '/memory', 9: '/dna' }

export default function LearningEngine() {
  const { team, version, toast } = useApp()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(() => api.learning(team), [team, version])
  const [filter, setFilter] = useState<'all' | 'live'>('all')
  const [refl, setRefl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reflect = async () => {
    setBusy(true)
    try {
      const r = await api.reflect(team, 'Based on the most recent outcomes, which lessons got stronger or weaker, and what should the next premortem check first? Cite IDs.')
      setRefl(r.text || r.message)
      if (r.available) { toast('memory', 'Reflection generated'); reload() }
    } catch (e) { toast('error', 'Reflect failed', (e as Error).message) } finally { setBusy(false) }
  }
  const events = (data?.events || []).filter((e) => filter === 'all' || e.live)
  return (
    <div>
      <PageHeader title="Learning Engine" description="How NEXUS gets better: every confirmed outcome is retained in Hindsight, recalled next time, and moves the confidence of the lessons it supports."
        meta={<><Badge tone="violet" icon={<RefreshCcw className="h-3 w-3" />}>Autonomous learning loop</Badge>{data && <SourceBadge source={data.memory_mode} />}</>}
        actions={<Button variant="memory" loading={busy} icon={<Sparkles className="h-4 w-4" />} onClick={reflect}>Run reflection now</Button>} />
      {loading && <Card><LoadingBlock rows={8} /></Card>}
      {error && <Card><ErrorState error={error} onRetry={reload} /></Card>}
      {data && (
        <div className="space-y-4">
          <Card className="flex items-start gap-3 p-4 text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="text-sub">{data.note}</span></Card>
          {refl && <Card className="border-memory/30 p-4 text-sm"><div className="mb-1 font-medium text-memory-fg">Hindsight reflection</div><Markdown text={refl} className="text-sub" /></Card>}
          <Card>
            <CardHeader title="The loop" subtitle="Live counts from this workspace. Click a step to go where it happens." icon={<RefreshCcw className="h-4 w-4" />} />
            <ol className="grid gap-2 p-5 sm:grid-cols-3 xl:grid-cols-9">
              {data.steps.map((s, i) => (
                <motion.li key={s.step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="relative">
                  <button onClick={() => nav(STEP_LINK[s.step])} className="h-full w-full rounded-lg border border-line bg-bg/40 p-3 text-left hover:border-primary/40">
                    <div className="flex items-center gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-soft text-2xs font-semibold text-primary-fg">{s.step}</span><span className="text-xs font-medium">{s.name}</span></div>
                    <div className="tnum mt-2 text-xl font-semibold">{s.count}</div>
                    <div className="text-2xs text-faint">{s.unit}</div>
                  </button>
                  {i < data.steps.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-faint xl:block" />}
                </motion.li>
              ))}
            </ol>
          </Card>
          <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
            <Card>
              <CardHeader title="Learning timeline" subtitle="Each outcome and how it changed what NEXUS believes" icon={<BrainCircuit className="h-4 w-4 text-memory" />}
                action={<Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All outcomes' }, { value: 'live', label: 'Logged in NEXUS' }]} />} />
              {!events.length && <EmptyState title={filter === 'live' ? 'Nothing logged in NEXUS yet' : 'No learning events yet'} body="Log a decision outcome or resolve an incident and the change appears here."
                action={<Button size="sm" variant="primary" onClick={() => nav('/decisions')}>Go to decisions</Button>} />}
              <ol className="relative mx-5 mb-5 mt-4 border-l border-line">
                {events.map((e) => (
                  <li key={e.ref} className="relative pb-5 pl-6 last:pb-0">
                    <span className={cn('absolute -left-[7px] top-1 h-3.5 w-3.5 rounded-full border-2 border-panel', e.net_change >= 0 ? 'bg-memory' : 'bg-warn')} />
                    <div className="flex flex-wrap items-center gap-2 text-2xs text-faint">
                      <span>{fmtDate(e.date)}</span><Ref id={e.ref} />{e.live ? <Badge tone="blue">logged in NEXUS</Badge> : <SourceBadge source="seed" />}
                    </div>
                    <div className="mt-1 text-sm font-medium">{e.title}</div>
                    <div className="mt-2 space-y-1.5">
                      {e.changes.map((c, k) => {
                        const up = c.after >= c.before
                        return (
                          <div key={k} className="grid gap-1 rounded-lg border border-line bg-bg/40 p-2.5 text-xs md:grid-cols-[1fr_auto]">
                            <div>
                              <div><span className="text-faint">Updated lesson: </span>{c.lesson}</div>
                              <div className="mt-0.5 text-faint">New evidence: <span className={c.event === 'confirmed' ? 'text-ok-fg' : 'text-warn-fg'}>{c.event}</span> · {c.detail}</div>
                            </div>
                            <div className="flex items-center gap-1.5 self-center whitespace-nowrap">
                              <span className="tnum text-faint">{Math.round(c.before * 100)}%</span>
                              {up ? <ArrowUpRight className="h-3.5 w-3.5 text-memory" /> : <ArrowDownRight className="h-3.5 w-3.5 text-warn" />}
                              <span className={cn('tnum font-semibold', up ? 'text-memory-fg' : 'text-warn-fg')}>{Math.round(c.after * 100)}%</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <CardHeader title="Current lessons" subtitle="What future premortems and investigations recall" icon={<Sparkles className="h-4 w-4 text-memory" />} />
              <div className="divide-y divide-line">
                {data.lessons.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1"><div className="text-[13px] leading-snug">{l.lesson}</div><div className="text-2xs text-faint">{l.history.length} outcomes · {l.kind}</div></div>
                    <Confidence value={l.confidence} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
