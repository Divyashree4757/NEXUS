import { Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, ChartCard, ChartTooltip, Legend, axis } from '@/charts/theme'
import { Card, CardHeader, ErrorState, LoadingBlock, PageHeader, Ref, SourceBadge } from '@/components/ui'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'

const TEAM_COLORS = [C.blue, C.violet, C.green, C.amber]

export default function TeamInsights() {
  const { team, version } = useApp()
  const a = useAsync(() => api.analytics(team), [team, version])
  const ign = useAsync(() => api.ignored(team), [team, version])
  const teams = a.data?.teams || []
  const cats = [...new Set(teams.flatMap((t) => t.categories.map((c) => c.category)))]
  const chart = cats.map((c) => ({ category: c, ...Object.fromEntries(teams.map((t) => [t.team, t.categories.find((x) => x.category === c)?.mean_ratio ?? null])) }))
  const rows: [string, (t: (typeof teams)[number]) => ReactNode][] = [
    ['Closed decisions', (t) => t.decisions],
    ['Overall actual ÷ estimate', (t) => `${t.overall_ratio}x`],
    ['Biggest blind spot', (t) => t.worst_category && `${t.worst_category.category} · ${t.worst_category.mean_ratio}x`],
    ['Best calibrated', (t) => t.best_category && `${t.best_category.category} · ${t.best_category.mean_ratio}x`],
    ['Assumption that keeps breaking', (t) => t.top_broken_assumption && `“${t.top_broken_assumption.assumption}” · ${t.top_broken_assumption.times_broke} of ${t.top_broken_assumption.times_made}`],
    ['Ignored warnings that came true', (t) => `${t.ignored_that_materialized} of ${t.ignored_warnings}`],
    ['Incidents traced to decisions', (t) => `${t.decision_caused_incidents} of ${t.incidents}`],
    ['Fix attempts that were temporary', (t) => `${Math.round(t.temporary_fix_rate * 100)}%`],
    ['Average time to resolve', (t) => `${t.avg_ttr_minutes} min`],
  ]
  return (
    <div>
      <PageHeader title="Team Insights" description="Each team has its own memory bank, so NEXUS learns each team's own estimation habits and blind spots." meta={<SourceBadge source="seed" />} />
      {a.error && <Card><ErrorState error={a.error} onRetry={a.reload} /></Card>}
      {a.loading && <Card><LoadingBlock rows={10} /></Card>}
      {a.data && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Team-level patterns" icon={<Users className="h-4 w-4" />} subtitle="Side by side across memory banks" />
            <div className="overflow-x-auto px-2 pb-3 pt-2">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line">
                  <th className="px-3 py-2.5" />
                  {teams.map((t, i) => <th key={t.team} className="px-3 py-2.5 text-left font-semibold capitalize"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: TEAM_COLORS[i] }} />{t.team}</th>)}
                </tr></thead>
                <tbody>{rows.map(([label, f]) => (
                  <tr key={label} className="border-b border-line/60 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-sub">{label}</td>
                    {teams.map((t) => <td key={t.team} className="px-3 py-2.5">{f(t) ?? '—'}</td>)}
                  </tr>))}</tbody>
              </table>
            </div>
          </Card>
          <ChartCard title="Team-level estimation patterns" subtitle="Average actual ÷ estimate by kind of work. 1.0x is a perfect estimate." footer="Illustrative seed data">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chart} barGap={3}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="category" {...axis} />
                <YAxis {...axis} width={32} />
                <ReferenceLine y={1} stroke={C.green} strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip fmt={(v) => (v == null ? 'no history' : `${v}x`)} />} />
                {teams.map((t, i) => <Bar key={t.team} name={t.team} dataKey={t.team} fill={TEAM_COLORS[i]} radius={[3, 3, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
            <Legend items={teams.map((t, i) => ({ label: t.team, color: TEAM_COLORS[i] }))} />
          </ChartCard>
          <Card>
            <CardHeader title={`People who were right (${team})`} subtitle="Warnings that were ignored and later happened. NEXUS surfaces these people's concerns on similar decisions." />
            {ign.loading && <LoadingBlock rows={4} />}
            {ign.data && (
              <div className="grid gap-3 p-5 md:grid-cols-2">
                {ign.data.people.filter((p) => p.ignored).map((p) => (
                  <div key={p.name} className="rounded-lg border border-line bg-bg/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{p.name}</div>
                      <div className="tnum text-xs text-sub">{p.ignored_then_materialized} of {p.ignored} ignored warnings happened</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {ign.data!.items.filter((x) => x.raised_by === p.name).slice(0, 3).map((x) => (
                        <div key={x.decision + x.risk} className="text-xs"><div className="flex flex-wrap items-center gap-1.5"><Ref id={x.decision} />{x.incidents.map((n) => <Ref key={n} id={n} />)}</div>
                          <div className="mt-1 text-sub">“{x.risk}”</div></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
