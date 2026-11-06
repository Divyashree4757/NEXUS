import { Search, Server } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Card, type Column, DataTable, EmptyState, ErrorState, LoadingBlock, PageHeader, Ref, SourceBadge } from '@/components/ui'
import { cn, fmtDate } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { ServiceRow } from '@/types'

export default function Services() {
  const { team, version } = useApp()
  const { data, error, loading, reload } = useAsync(() => api.services(team), [team, version])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const rows = useMemo(() => (data || []).filter((s) => s.service.includes(q.toLowerCase())), [data, q])
  const cols: Column<ServiceRow>[] = [
    { key: 'service', header: 'Service', render: (s) => <span className="font-mono text-[13px]">{s.service}</span>, sort: (s) => s.service },
    { key: 'decisions', header: 'Decisions', render: (s) => <span className="tnum">{s.decisions}</span>, sort: (s) => s.decisions },
    { key: 'incidents', header: 'Incidents', render: (s) => <span className="tnum">{s.incidents}{s.sev1 > 0 && <Badge tone="red" className="ml-2">{s.sev1} SEV1</Badge>}</span>, sort: (s) => s.incidents },
    { key: 'overrun', header: 'Avg overrun', sort: (s) => s.avg_overrun, render: (s) => s.avg_overrun ? <span className={cn('tnum', s.avg_overrun >= 1.8 ? 'text-crit-fg' : s.avg_overrun >= 1.3 ? 'text-warn-fg' : 'text-ok-fg')}>{s.avg_overrun}x</span> : <span className="text-faint">—</span> },
    { key: 'temp', header: 'Temporary fixes', hideOnMobile: true, sort: (s) => s.temporary_fix_rate, render: (s) => s.temporary_fix_rate != null ? <span className="tnum">{Math.round(s.temporary_fix_rate * 100)}%</span> : <span className="text-faint">—</span> },
    { key: 'last', header: 'Last incident', hideOnMobile: true, sort: (s) => s.last_incident, render: (s) => <span className="text-xs text-sub">{fmtDate(s.last_incident)}</span> },
  ]
  const sel = data?.find((s) => s.service === open)
  return (
    <div>
      <PageHeader title="Services" description="Every service NEXUS has memory about: the decisions that changed it and the incidents it has had." meta={<SourceBadge source="seed" />} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <div className="border-b border-line p-4">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input className="input h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter services" aria-label="Filter services" /></div>
          </div>
          {loading && <LoadingBlock rows={8} />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {data && <DataTable rows={rows} columns={cols} rowKey={(s) => s.service} onRowClick={(s) => setOpen(s.service)} initialSort={{ key: 'incidents', dir: 'desc' }}
            empty={<EmptyState icon={<Server className="h-5 w-5" />} title="No services match" />} />}
        </Card>
        <Card className="p-5">
          {!sel ? <EmptyState icon={<Server className="h-5 w-5" />} title="Select a service" body="See the decisions and incidents NEXUS remembers for it." /> : (
            <div>
              <div className="font-mono text-base font-semibold">{sel.service}</div>
              <div className="mt-4 text-2xs font-medium uppercase tracking-wide text-faint">Decisions</div>
              <div className="mt-2 flex flex-wrap gap-1">{sel.decision_ids.length ? sel.decision_ids.map((d) => <Ref key={d} id={d} />) : <span className="text-xs text-sub">None</span>}</div>
              <div className="mt-4 text-2xs font-medium uppercase tracking-wide text-faint">Incidents</div>
              <div className="mt-2 flex flex-wrap gap-1">{sel.incident_ids.length ? sel.incident_ids.map((d) => <Ref key={d} id={d} />) : <span className="text-xs text-sub">None</span>}</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
