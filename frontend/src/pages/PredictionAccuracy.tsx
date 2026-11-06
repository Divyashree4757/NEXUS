import { Gauge, Target } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, ChartCard, ChartTooltip, Legend, axis } from '@/charts/theme'
import { Card, CardHeader, type Column, DataTable, ErrorState, LoadingBlock, PageHeader, SourceBadge, Stat } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { CurvePoint } from '@/types'

export default function PredictionAccuracy() {
  const { team, version } = useApp()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(() => api.analytics(team), [team, version])
  const curve = data?.accuracy_curve || []
  const last = curve.slice(-6)
  const avg = (k: keyof CurvePoint) => (last.length ? last.reduce((a, p) => a + (p[k] as number), 0) / last.length : 0)
  const cols: Column<CurvePoint>[] = [
    { key: 'id', header: 'Decision', render: (p) => <span className="font-mono text-xs text-sub">{p.id}</span>, sort: (p) => p.id },
    { key: 'title', header: 'Title', render: (p) => <span className="line-clamp-1 max-w-[340px]">{p.title}</span> },
    { key: 'hist', header: 'Memories available', render: (p) => <span className="tnum">{p.history_size}</span>, sort: (p) => p.history_size, hideOnMobile: true },
    { key: 'raw', header: 'Team estimate error', render: (p) => <span className="tnum text-sub">{p.raw_error_pct}%</span>, sort: (p) => p.raw_error_pct },
    { key: 'nexus', header: 'NEXUS error', sort: (p) => p.nexus_error_pct,
      render: (p) => <span className={cn('tnum', p.nexus_error_pct < p.raw_error_pct ? 'text-ok-fg' : 'text-warn-fg')}>{p.nexus_error_pct}%</span> },
  ]
  return (
    <div>
      <PageHeader title="Prediction Accuracy" description="How close NEXUS-corrected estimates came to reality, computed for each decision using only the memories that existed when it was proposed."
        meta={<SourceBadge source="seed" />} />
      {error && <Card><ErrorState error={error} onRetry={reload} /></Card>}
      {loading && <Card><LoadingBlock rows={10} label="Replaying estimates" /></Card>}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="NEXUS accuracy (last 6)" value={`${(100 - avg('nexus_error_pct')).toFixed(0)}%`} icon={<Gauge className="h-4 w-4" />} accent="violet" />
            <Stat label="Raw team accuracy (last 6)" value={`${(100 - avg('raw_error_pct')).toFixed(0)}%`} icon={<Target className="h-4 w-4" />} />
            <Stat label="Team overrun factor" value={`${data.calibration.overall_ratio}x`} sub={`over ${data.calibration.n} closed decisions`} icon={<Target className="h-4 w-4" />} accent="amber" />
            <Stat label="Decisions replayed" value={curve.length} icon={<Gauge className="h-4 w-4" />} accent="green" />
          </div>
          <ChartCard title="Decision prediction accuracy over time" subtitle="Rolling estimate error (4 decisions). Lower is better." footer="Accuracy = 100% − |actual − estimate| ÷ actual. Illustrative seed data, not measured results.">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={curve} margin={{ right: 12 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="id" {...axis} />
                <YAxis {...axis} unit="%" width={44} />
                <Tooltip content={<ChartTooltip fmt={(v) => `${v}%`} labelFmt={(l, p) => `${l} · ${(p as { title?: string })?.title ?? ''}`} />} />
                <Line name="Team estimate error" dataKey="raw_rolling" stroke={C.muted} strokeWidth={2} dot={false} />
                <Line name="NEXUS-corrected error" dataKey="nexus_rolling" stroke={C.violet} strokeWidth={3} dot={false} />
                <Line name="NEXUS per decision" dataKey="nexus_error_pct" stroke={C.violet} strokeOpacity={0.35} strokeWidth={1} dot={{ r: 2, fill: C.violet }} />
              </LineChart>
            </ResponsiveContainer>
            <Legend items={[{ label: 'Team estimate error (rolling)', color: C.muted }, { label: 'NEXUS-corrected error (rolling)', color: C.violet }]} />
          </ChartCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Estimated versus actual completion time" subtitle="Every closed decision, in order" footer="Illustrative seed data">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.estimate_vs_actual} barGap={1}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="id" {...axis} tick={{ fill: C.axis, fontSize: 10 }} />
                  <YAxis {...axis} unit="w" width={36} />
                  <Tooltip content={<ChartTooltip fmt={(v) => `${v} weeks`} labelFmt={(l, p) => `${l} · ${(p as { title?: string })?.title ?? ''}`} />} />
                  <Bar name="Estimated" dataKey="estimate" fill={C.muted} radius={[2, 2, 0, 0]} />
                  <Bar name="Actual" dataKey="actual" fill={C.blue} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <Legend items={[{ label: 'Estimated', color: C.muted }, { label: 'Actual', color: C.blue }]} />
            </ChartCard>
            <ChartCard title="Calibration by kind of work" subtitle="Average actual ÷ estimate. The dashed line is a perfect estimate." footer="Illustrative seed data">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.calibration.categories}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="category" {...axis} />
                  <YAxis {...axis} width={32} />
                  <ReferenceLine y={1} stroke={C.green} strokeDasharray="4 4" />
                  <Tooltip content={<ChartTooltip fmt={(v, _n, p) => `${v}x over ${(p as { n: number }).n} decisions`} />} />
                  <Bar name="Actual ÷ estimate" dataKey="mean_ratio" radius={[3, 3, 0, 0]}>
                    {data.calibration.categories.map((c) => <Cell key={c.category} fill={c.mean_ratio >= 1.8 ? C.red : c.mean_ratio >= 1.3 ? C.amber : C.green} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <Card>
            <CardHeader title="Per-decision replay" subtitle="Click a row to open the decision replay" />
            <div className="pt-3"><DataTable rows={curve} columns={cols} rowKey={(p) => p.id} onRowClick={(p) => nav(`/decisions/${p.id}`)} initialSort={{ key: 'id', dir: 'desc' }} /></div>
          </Card>
        </div>
      )}
    </div>
  )
}
