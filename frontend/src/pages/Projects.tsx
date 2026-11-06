import { FolderKanban, Siren } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Ref, RiskBadge, SourceBadge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'

const level = (s: number) => (s >= 70 ? 'critical' : s >= 50 ? 'high' : s >= 30 ? 'medium' : 'low')

export default function Projects() {
  const { team, version } = useApp()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(() => api.projects(team), [team, version])
  return (
    <div>
      <PageHeader title="Projects" description="Decisions grouped by project, with how they ran against their estimates and what they led to." meta={<SourceBadge source="seed" />}
        actions={<Button variant="primary" onClick={() => nav('/decisions?new=1')}>New decision</Button>} />
      {error && <Card><ErrorState error={error} onRetry={reload} /></Card>}
      {loading && <Card><LoadingBlock rows={8} /></Card>}
      {data && !data.length && <Card><EmptyState icon={<FolderKanban className="h-5 w-5" />} title="No projects yet" body="Projects appear as soon as a decision is recorded against one." /></Card>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((p) => {
          const over = p.estimate_weeks ? Math.min(100, (p.actual_weeks / Math.max(p.estimate_weeks, p.actual_weeks)) * 100) : 0
          return (
            <Card key={p.project} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div><div className="font-semibold">{p.project}</div><div className="mt-0.5 text-xs text-sub">{p.decisions} decisions · {p.open} open · {p.owners.join(', ')}</div></div>
                <RiskBadge level={level(p.max_risk)} score={p.max_risk} />
              </div>
              <div className="mt-4">
                <div className="flex items-baseline justify-between text-xs"><span className="text-sub">Estimated vs actual (closed)</span>
                  <span className={cn('tnum font-medium', (p.avg_ratio ?? 1) >= 1.8 ? 'text-crit-fg' : (p.avg_ratio ?? 1) >= 1.3 ? 'text-warn-fg' : 'text-ok-fg')}>{p.avg_ratio ? `${p.avg_ratio}x` : '—'}</span></div>
                <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-line">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary/40" style={{ width: '100%' }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${p.actual_weeks ? (Math.min(p.estimate_weeks, p.actual_weeks) / p.actual_weeks) * 100 : over}%` }} />
                </div>
                <div className="tnum mt-1 text-2xs text-faint">{p.estimate_weeks}w planned · {p.actual_weeks}w actual</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1">{p.services.map((s) => <Badge key={s}>{s}</Badge>)}</div>
              <div className="mt-4 flex flex-wrap gap-1">{p.decision_ids.map((d) => <Ref key={d} id={d} />)}</div>
              {p.incidents.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-1 text-2xs text-crit-fg"><Siren className="mr-0.5 h-3.5 w-3.5" />{p.incidents.map((i) => <Ref key={i} id={i} />)}</div>}
              <div className="mt-auto pt-4"><Button size="sm" variant="secondary" className="w-full" onClick={() => nav(`/decisions?project=${encodeURIComponent(p.project)}`)}>View decisions</Button></div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
