import { ShieldAlert } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { C, ChartCard, ChartTooltip, Legend, axis } from '@/charts/theme'
import { Card, ErrorState, LoadingBlock, PageHeader, SourceBadge } from '@/components/ui'
import { fixColor, riskColor } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'

export default function RiskAnalytics() {
  const { team, version } = useApp()
  const { data, error, loading, reload } = useAsync(() => api.analytics(team), [team, version])
  return (
    <div>
      <PageHeader title="Risk Analytics" description="Where risk concentrates, which assumptions fail most, and which fixes actually work." meta={<SourceBadge source="seed" />} />
      {error && <Card><ErrorState error={error} onRetry={reload} /></Card>}
      {loading && <Card><LoadingBlock rows={10} label="Computing analytics" /></Card>}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Risk distribution" subtitle="Predicted risk of every decision, scored with history available at proposal time" icon={<ShieldAlert className="h-4 w-4" />} footer="Illustrative seed data">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.risk_distribution.filter((r) => r.count)} dataKey="count" nameKey="level" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                    {data.risk_distribution.filter((r) => r.count).map((r) => <Cell key={r.level} fill={riskColor[r.level]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip fmt={(v) => `${v} decisions`} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid w-full grid-cols-2 gap-2 sm:w-48 sm:grid-cols-1">
                {data.risk_distribution.map((r) => (
                  <div key={r.level} className="flex items-center justify-between rounded-md border border-line px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5 capitalize text-sub"><span className="h-2 w-2 rounded-full" style={{ background: riskColor[r.level] }} />{r.level}</span>
                    <span className="tnum font-medium">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Does the risk score predict overruns?" subtitle="Predicted risk at proposal time vs actual ÷ estimate" footer="Each point is a closed decision. Illustrative seed data.">
            <ResponsiveContainer width="100%" height={240}>
              <ScatterChart margin={{ left: 0, right: 10, top: 10 }}>
                <CartesianGrid stroke={C.grid} />
                <XAxis type="number" dataKey="risk" name="Risk score" domain={[0, 100]} {...axis} label={{ value: 'risk score', position: 'insideBottomRight', offset: -4, fill: C.axis, fontSize: 11 }} />
                <YAxis type="number" dataKey="ratio" name="Overrun" unit="x" {...axis} width={40} />
                <ZAxis range={[60, 60]} />
                <ReferenceLine y={1} stroke={C.green} strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip fmt={(v, n) => (n === 'Overrun' ? `${v}x` : String(v))} labelFmt={(_l, p) => `${(p as { id: string }).id} · ${(p as { title: string }).title}`} />} />
                <Scatter data={data.risk_vs_overrun} fill={C.violet} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Assumption failure frequency" subtitle="How often each assumption broke when the team relied on it" footer="Illustrative seed data">
            <ResponsiveContainer width="100%" height={Math.max(200, data.assumptions.slice(0, 8).length * 34)}>
              <BarChart data={data.assumptions.slice(0, 8).map((a) => ({ ...a, name: a.assumption.length > 38 ? a.assumption.slice(0, 36) + '…' : a.assumption, held: a.times_made - a.times_broke }))} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" allowDecimals={false} {...axis} />
                <YAxis type="category" dataKey="name" width={230} {...axis} tick={{ fill: '#97a3b8', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip labelFmt={(_l, p) => (p as { assumption: string }).assumption} />} />
                <Bar name="Broke" dataKey="times_broke" stackId="a" fill={C.red} />
                <Bar name="Held" dataKey="held" stackId="a" fill={C.muted} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Legend items={[{ label: 'Broke', color: C.red }, { label: 'Held', color: C.muted }]} />
          </ChartCard>

          <ChartCard title="Incident recurrence rate" subtitle="Share of incidents per service that matched an earlier incident" footer="Illustrative seed data">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.recurrence}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="service" {...axis} interval={0} tick={{ fill: C.axis, fontSize: 10 }} />
                <YAxis {...axis} allowDecimals={false} width={28} />
                <Tooltip content={<ChartTooltip fmt={(v, n, p) => (n === 'Recurring' ? `${v} (${Math.round((p as { rate: number }).rate * 100)}%)` : String(v))} />} />
                <Bar name="Incidents" dataKey="incidents" fill={C.muted} radius={[3, 3, 0, 0]} />
                <Bar name="Recurring" dataKey="recurring" fill={C.amber} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Legend items={[{ label: 'All incidents', color: C.muted }, { label: 'Recurring', color: C.amber }]} />
          </ChartCard>

          <ChartCard title="Failed versus successful fixes" subtitle="Every fix attempt on record, by result" footer="Illustrative seed data" className="lg:col-span-2">
            <div className="grid gap-4 md:grid-cols-[240px_1fr]">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.fix_outcomes} dataKey="count" nameKey="result" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                    {data.fix_outcomes.map((f) => <Cell key={f.result} fill={fixColor[f.result]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip fmt={(v) => `${v} attempts`} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint"><th className="py-2 text-left font-medium">Fix</th><th className="text-right font-medium">Tried</th><th className="text-right font-medium">Resolved</th><th className="text-right font-medium">Temporary</th><th className="text-right font-medium">Failed</th><th className="text-right font-medium">Lasted</th></tr></thead>
                  <tbody>{data.fix_stats.slice(0, 8).map((f) => (
                    <tr key={f.action} className="border-b border-line/60 last:border-0">
                      <td className="max-w-[280px] truncate py-2 pr-3">{f.action}</td>
                      <td className="tnum text-right">{f.tried}</td><td className="tnum text-right text-ok-fg">{f.resolved}</td>
                      <td className="tnum text-right text-warn-fg">{f.temporary}</td><td className="tnum text-right text-crit-fg">{f.failed}</td>
                      <td className="tnum text-right text-sub">{f.avg_lasted_days != null ? `${f.avg_lasted_days}d` : '—'}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  )
}
