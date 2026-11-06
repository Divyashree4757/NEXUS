import { BookOpen, ClipboardCopy, Download, FileQuestion, FileWarning, Library, ShieldAlert, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, ErrorState, LoadingBlock, PageHeader, Ref, Segmented, SourceBadge, Stat } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { KnowledgeGap } from '@/types'

export default function KnowledgeRetention() {
  const { team, version, toast } = useApp()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(() => api.knowledge(team), [team, version])
  const [sev, setSev] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [runbook, setRunbook] = useState<{ service: string; markdown: string } | null>(null)
  const gaps = useMemo(() => (data?.gaps || []).filter((g) => sev === 'all' || g.severity === sev), [data, sev])
  const m = data?.metrics

  const act = async (g: KnowledgeGap) => {
    const ref = g.refs[0]
    if (g.action_kind === 'runbook') {
      const svc = g.title.split(' ')[0]
      try { const r = await api.runbook(team, svc); setRunbook({ service: svc, markdown: r.markdown }) } catch (e) { toast('error', 'Could not draft runbook', (e as Error).message) }
    } else if (g.action_kind === 'incident' && ref) nav(`/incidents/${ref}`)
    else if (g.action_kind === 'decision' && ref) nav(`/decisions/${ref}`)
    else if (g.kind === 'unresolved_lesson') nav('/conflicts')
    else nav('/services')
  }
  const copyRequest = async (g: KnowledgeGap) => {
    const text = `Hi — NEXUS flagged a knowledge gap: "${g.title}". ${g.detail} Could you confirm the details (${g.refs.slice(0, 4).join(', ')}) so the team's memory is complete? Thanks!`
    try { await navigator.clipboard.writeText(text); toast('success', 'Request copied', 'Paste it into Slack or email') } catch { toast('error', 'Clipboard unavailable', text) }
  }

  return (
    <div>
      <PageHeader title="Knowledge Retention" description="Engineering knowledge that is undocumented, unconfirmed, or held by one person, so it doesn't disappear when people move on. This measures continuity, not individual performance."
        meta={<><Badge tone="blue" icon={<Library className="h-3 w-3" />}>Knowledge risk</Badge><SourceBadge source="seed" /></>} />
      {error && <Card><ErrorState error={error} onRetry={reload} /></Card>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat loading={loading} label="Documentation completeness" value={m?.documentation_completeness != null ? `${m.documentation_completeness}%` : '—'} icon={<BookOpen className="h-4 w-4" />} accent="green" />
        <Stat loading={loading} label="Unresolved gaps" value={m?.unresolved_gaps ?? '—'} icon={<ShieldAlert className="h-4 w-4" />} accent="amber" />
        <Stat loading={loading} label="Incidents without root cause" value={m?.incidents_without_root_cause ?? '—'} icon={<FileQuestion className="h-4 w-4" />} accent="red" />
        <Stat loading={loading} label="Decisions without outcome" value={m?.decisions_without_outcome ?? '—'} icon={<FileWarning className="h-4 w-4" />} />
        <Stat loading={loading} label="Services with little history" value={m?.services_limited_knowledge ?? '—'} icon={<Library className="h-4 w-4" />} accent="violet" />
        <Stat loading={loading} label="Concentration warnings" value={m?.concentration_warnings ?? '—'} icon={<UserRound className="h-4 w-4" />} accent="amber" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title="Knowledge gaps" subtitle="Ranked by risk, with the action that closes each one" icon={<ShieldAlert className="h-4 w-4" />}
            action={<Segmented value={sev} onChange={setSev} options={[{ value: 'all', label: 'All' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />} />
          {loading && <LoadingBlock rows={8} />}
          {data && !gaps.length && <EmptyState title="No gaps at this level" />}
          <ul className="divide-y divide-line">
            {gaps.map((g, i) => (
              <li key={i} className="flex flex-col gap-3 px-5 py-3.5 md:flex-row md:items-center">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', g.severity === 'high' ? 'bg-crit' : g.severity === 'medium' ? 'bg-warn' : 'bg-faint')} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{g.title}</div>
                  <div className="text-xs text-sub">{g.detail}</div>
                  {g.refs.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{g.refs.slice(0, 8).map((r) => <Ref key={r} id={r} />)}{g.refs.length > 8 && <span className="text-2xs text-faint">+{g.refs.length - 8}</span>}</div>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {g.kind === 'root_cause' && <Button size="sm" variant="ghost" icon={<ClipboardCopy className="h-3.5 w-3.5" />} onClick={() => copyRequest(g)}>Copy request</Button>}
                  <Button size="sm" variant="secondary" onClick={() => act(g)}>{g.action}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Service knowledge coverage" subtitle="Incidents vs documented resolutions per service" icon={<Library className="h-4 w-4" />} />
          {data && (
            <div className="overflow-x-auto px-2 pb-3 pt-2">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-faint"><th className="px-3 py-2 font-medium">Service</th><th className="px-2 py-2 text-right font-medium">Incidents</th><th className="px-2 py-2 text-right font-medium">Documented</th><th className="px-3 py-2 font-medium">Runbook</th></tr></thead>
                <tbody>{data.services.map((s) => (
                  <tr key={s.service} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2 font-mono">{s.service}{s.tier === 'critical' && <Badge tone="red" className="ml-1.5">critical</Badge>}</td>
                    <td className="tnum px-2 py-2 text-right">{s.incidents}</td>
                    <td className={cn('tnum px-2 py-2 text-right', s.incidents > s.documented_resolutions && 'text-warn-fg')}>{s.documented_resolutions}</td>
                    <td className="px-3 py-2">{s.runbook ? <Badge tone="green">yes</Badge> : s.runbook === false ? (
                      s.incidents ? <button className="text-primary-fg hover:underline" onClick={async () => { const r = await api.runbook(team, s.service); setRunbook({ service: s.service, markdown: r.markdown }) }}>Draft one</button> : <span className="text-faint">no</span>) : <span className="text-faint">—</span>}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <Dialog open={!!runbook} onClose={() => setRunbook(null)} wide title={`Runbook draft · ${runbook?.service ?? ''}`} description="Drafted from this service's remembered incidents and fix history. Review before publishing."
        footer={<>
          <Button variant="secondary" icon={<ClipboardCopy className="h-4 w-4" />} onClick={async () => { try { await navigator.clipboard.writeText(runbook!.markdown); toast('success', 'Runbook copied') } catch { toast('error', 'Clipboard unavailable') } }}>Copy</Button>
          <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={() => {
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([runbook!.markdown], { type: 'text/markdown' })); a.download = `runbook-${runbook!.service}.md`; a.click()
            toast('success', 'Runbook downloaded')
          }}>Download .md</Button></>}>
        <pre className="whitespace-pre-wrap rounded-lg border border-line bg-bg p-4 font-mono text-xs text-sub">{runbook?.markdown}</pre>
      </Dialog>
    </div>
  )
}
