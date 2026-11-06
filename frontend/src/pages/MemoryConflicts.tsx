import { GitCompareArrows, ShieldCheck } from 'lucide-react'
import { ConflictPanel } from '@/components/memory/ConflictPanel'
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SourceBadge } from '@/components/ui'
import { useApp, useAsync } from '@/state/app'
import { api } from '@/services/api'

export default function MemoryConflicts() {
  const { team, version, health } = useApp()
  const { data, error, loading, reload } = useAsync(() => api.conflicts(team), [team, version])
  return (
    <div>
      <PageHeader title="Memory Conflicts" description="Before NEXUS recommends a fix or trusts an assumption, it checks whether the team's history disagrees with itself, and explains why."
        meta={<><Badge tone="amber" icon={<GitCompareArrows className="h-3 w-3" />}>Conflict detector</Badge><SourceBadge source={health?.memory_mode || 'hindsight'} /><SourceBadge source="seed" /></>} />
      <Card className="mb-4 p-4 text-sm text-sub">
        A conflict is a fix that resolved one incident but failed or only helped temporarily in another, or an assumption that held in one decision and broke in another.
        NEXUS compares the recorded context of both and never hides either side. RECALL-X shows the same panel inside an incident when the conflict involves its service.
      </Card>
      {loading && <Card><LoadingBlock rows={8} label="Comparing remembered outcomes" /></Card>}
      {error && <Card><ErrorState error={error} onRetry={reload} /></Card>}
      {data && !data.length && <Card><EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No conflicting memories" body="Every remembered fix and assumption has a consistent outcome so far." /></Card>}
      <div className="space-y-4">{data?.map((c) => <ConflictPanel key={c.id} c={c} />)}</div>
    </div>
  )
}
