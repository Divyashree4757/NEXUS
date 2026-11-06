import { stripMarkdown } from '@/components/ui/Markdown'
import { AlertOctagon, ArrowRight, BrainCircuit, CheckCircle2, GitCommitHorizontal, Repeat2, Rocket, ShieldAlert, Siren, Target, Gauge } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, ChartCard, ChartTooltip, Legend, axis } from '@/charts/theme'
import { Badge, Button, Card, CardHeader, Confidence, EmptyState, ErrorState, LoadingBlock, PageHeader, Ref, RiskBadge, SourceBadge, Stat } from '@/components/ui'
import { cn, fmtDate, greeting, riskColor } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'

const actIcon = {
  decision: <Target className="h-3.5 w-3.5 text-primary" />,
  shipped: <Rocket className="h-3.5 w-3.5 text-ok" />,
  incident: <Siren className="h-3.5 w-3.5 text-crit" />,
  resolved: <CheckCircle2 className="h-3.5 w-3.5 text-ok" />,
}
const actLabel = { decision: 'Decision proposed', shipped: 'Shipped', incident: 'Incident', resolved: 'Resolved' }

export default function Overview() {
  const { team, version } = useApp()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(() => api.overview(team), [team, version])
  const m = data?.metrics
  const totalRisk = data ? data.risk_distribution.reduce((a, r) => a + r.count, 0) || 1 : 1

  return (
    <div>
      <PageHeader
        title={`${greeting()}. Here’s your engineering intelligence.`}
        description="Your engineering history, decisions, and incidents — connected."
        meta={<><Badge tone="blue" className="capitalize">{team} workspace</Badge>{data && <SourceBadge source={data.memory_mode} />}<SourceBadge source="seed" /></>}
        actions={<><Button variant="secondary" icon={<Siren className="h-4 w-4" />} onClick={() => nav('/incidents?new=1')}>Report incident</Button>
          <Button variant="primary" icon={<Target className="h-4 w-4" />} onClick={() => nav('/decisions?new=1')}>New decision</Button></>}
      />
      {error && <Card className="mb-6"><ErrorState error={error} onRetry={reload} /></Card>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat loading={loading} label="Engineering decisions" value={m?.decisions ?? '—'} sub={m && `${m.open_decisions} open · ${m.decisions - m.open_decisions} with outcomes`} icon={<GitCommitHorizontal className="h-4 w-4" />} />
        <Stat loading={loading} label="Historical incidents" value={m?.incidents ?? '—'} sub={m && `${m.resolved_incidents} resolved and retained`} icon={<Siren className="h-4 w-4" />} accent="red" />
        <Stat loading={loading} label="Risks identified" value={m?.risks_identified ?? '—'} sub={m && `${m.high_risk_decisions} high or critical decisions`} icon={<ShieldAlert className="h-4 w-4" />} accent="amber" />
        <Stat loading={loading} label="Recurring failure patterns" value={m?.recurring_patterns ?? '—'} sub="lessons at ≥70% confidence" icon={<Repeat2 className="h-4 w-4" />} accent="violet" />
        <Stat loading={loading} label="Prediction accuracy" value={m?.prediction_accuracy != null ? `${m.prediction_accuracy}%` : '—'}
          sub={m?.team_accuracy != null && <span>vs <span className="text-fg">{m.team_accuracy}%</span> for raw team estimates</span>} icon={<Gauge className="h-4 w-4" />} accent="green" />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        {/* A. timeline */}
        <Card>
          <CardHeader title="Engineering activity" subtitle="Decisions, shipped work, incidents and resolutions" icon={<GitCommitHorizontal className="h-4 w-4" />}
            action={<Button size="sm" variant="ghost" onClick={() => nav('/decisions')}>View all</Button>} />
          {loading ? <LoadingBlock rows={8} /> : data && (
            <ol className="relative mx-5 mb-4 mt-4 border-l border-line">
              {data.activity.slice(0, 10).map((a, i) => (
                <li key={i} className="group relative cursor-pointer pb-4 pl-5 last:pb-1" onClick={() => nav(a.ref.startsWith('INC') ? `/incidents/${a.ref}` : `/decisions/${a.ref}`)}>
                  <span className="absolute -left-[11px] top-0.5 grid h-5 w-5 place-items-center rounded-full border border-line bg-panel">{actIcon[a.kind]}</span>
                  <div className="flex items-center gap-2 text-2xs text-faint"><span>{actLabel[a.kind]}</span><span>·</span><span>{fmtDate(a.at)}</span></div>
                  <div className="mt-0.5 text-[13px] leading-snug group-hover:text-primary-fg"><span className="mr-1.5 font-mono text-2xs text-faint">{a.ref}</span>{a.title}</div>
                  <div className="text-2xs text-sub">{a.detail}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:col-span-2">
        {/* B. risk intelligence */}
        <Card>
          <CardHeader title="Risk intelligence" subtitle="Predicted risk across all decisions, scored from history at proposal time" icon={<ShieldAlert className="h-4 w-4" />} />
          {loading ? <LoadingBlock rows={4} /> : data && (
            <div className="px-5 pb-5 pt-4">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-line">
                {data.risk_distribution.map((r) => <div key={r.level} style={{ width: `${(r.count / totalRisk) * 100}%`, background: riskColor[r.level] }} />)}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {data.risk_distribution.map((r) => (
                  <div key={r.level}><div className="tnum text-xl font-semibold">{r.count}</div><div className="flex items-center gap-1.5 text-2xs capitalize text-sub"><span className="h-1.5 w-1.5 rounded-full" style={{ background: riskColor[r.level] }} />{r.level}</div></div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {data.top_risks.map((r) => (
                  <button key={r.id} onClick={() => nav(`/decisions/${r.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-line bg-bg/40 px-3 py-2 text-left hover:border-line2">
                    <span className="font-mono text-2xs text-faint">{r.id}</span>
                    <span className="min-w-0 flex-1 truncate text-xs">{r.title}</span>
                    <RiskBadge level={r.level} score={r.score} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* C. memory insights */}
        <Card>
          <CardHeader title="Recent memory insights" subtitle="Lessons NEXUS keeps confirming from outcomes" icon={<BrainCircuit className="h-4 w-4 text-memory" />}
            action={<Button size="sm" variant="ghost" onClick={() => nav('/memory')}>Explorer</Button>} />
          {loading ? <LoadingBlock rows={4} /> : data && (
            <div className="space-y-2 px-5 pb-5 pt-4">
              {data.insights.filter((o) => o.op === 'reflect').slice(0, 1).map((o) => (
                <div key={o.seq} className="rounded-lg border border-memory/25 bg-memory-soft/25 p-3 text-xs">
                  <div className="mb-1 flex items-center justify-between"><span className="font-medium text-memory-fg">Hindsight reflection</span><SourceBadge source={o.source} /></div>
                  <p className="line-clamp-4 text-sub">{stripMarkdown(o.text || '')}</p>
                </div>
              ))}
              {data.blind_spots.slice(0, 4).map((b) => (
                <div key={b.lesson} className="flex items-center gap-3 rounded-lg border border-line bg-bg/40 px-3 py-2">
                  <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-memory" />
                  <span className="min-w-0 flex-1 text-xs">{b.lesson}</span>
                  <Confidence value={b.confidence} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* D. decision vs actual */}
        <ChartCard className="md:col-span-2" title="Decision vs actual performance" subtitle="Estimated vs actual weeks, last 10 closed decisions" icon={<Target className="h-4 w-4" />}
          footer="Illustrative seed data">
          {loading ? <LoadingBlock rows={6} /> : data && (
            <>
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={data.decision_vs_actual} barGap={2}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="id" {...axis} />
                  <YAxis {...axis} unit="w" width={36} />
                  <Tooltip content={<ChartTooltip fmt={(v) => `${v} weeks`} labelFmt={(l, p) => `${l} · ${(p as { title?: string })?.title ?? ''}`} />} />
                  <Bar name="Estimated" dataKey="estimate" fill={C.muted} radius={[3, 3, 0, 0]} />
                  <Bar name="Actual" dataKey="actual" fill={C.blue} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <Legend items={[{ label: 'Estimated', color: C.muted }, { label: 'Actual', color: C.blue }]} />
            </>
          )}
        </ChartCard>

        </div>
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        {/* E. incident trends */}
        <ChartCard title="Incident trends" subtitle="Incidents per quarter by severity" icon={<Siren className="h-4 w-4" />} footer="Illustrative seed data"
          action={<Button size="sm" variant="ghost" onClick={() => nav('/incidents')}>Incidents</Button>}>
          {loading ? <LoadingBlock rows={6} /> : data && (data.incident_trend.length ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.incident_trend}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="quarter" {...axis} />
                  <YAxis {...axis} allowDecimals={false} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line name="Total" dataKey="total" stroke={C.blue} strokeWidth={2.5} dot={{ r: 3, fill: C.blue }} />
                  <Line name="SEV1" dataKey="SEV1" stroke={C.red} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                  <Line name="SEV2" dataKey="SEV2" stroke={C.amber} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
              <Legend items={[{ label: 'Total', color: C.blue }, { label: 'SEV1', color: C.red, dashed: true }, { label: 'SEV2', color: C.amber, dashed: true }]} />
            </>
          ) : <EmptyState title="No incidents yet" />)}
        </ChartCard>

        {/* F. blind spots */}
        <Card className="xl:col-span-2">
          <CardHeader title="Organizational blind spots" subtitle="Recurring mistakes discovered from historical memory, strongest first" icon={<AlertOctagon className="h-4 w-4 text-warn" />}
            action={<Button size="sm" variant="ghost" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => nav('/analytics/teams')}>Team insights</Button>} />
          {loading ? <LoadingBlock rows={5} /> : data && (
            <div className="grid gap-2 px-5 pb-5 pt-4 md:grid-cols-2">
              {data.blind_spots.map((b) => (
                <div key={b.lesson} className="rounded-lg border border-line bg-bg/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[13px] leading-snug">{b.lesson}</div>
                    <Badge tone={b.kind === 'fix' ? 'red' : b.kind === 'people' ? 'violet' : b.kind === 'assumption' ? 'amber' : 'blue'} className="capitalize">{b.kind}</Badge>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-1">{b.refs.map((r, i) => <Ref key={r + i} id={r} />)}</div>
                    <Confidence value={b.confidence} />
                  </div>
                  <div className={cn('mt-1 text-2xs text-faint')}>{b.observations} outcomes observed</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
