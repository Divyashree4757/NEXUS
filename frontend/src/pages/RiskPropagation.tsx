import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { AlertTriangle, BookOpen, Maximize2, Minus, Plus, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Ref, Select, SourceBadge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { PropEdge, PropNode } from '@/types'

type N = PropNode & SimulationNodeDatum
type L = SimulationLinkDatum<N> & PropEdge
const W = 1100, H = 680
const EDGE = { declared: '#64708a', observed: '#ef4444', inferred: '#3b82f6' }
const riskFill = (r: number) => (r >= 60 ? '#ef4444' : r >= 30 ? '#f59e0b' : r > 0 ? '#3b82f6' : '#2d3950')

/** Everything reachable downstream from `start`: services a failure or change in `start` can propagate to. */
function downstream(start: string[], edges: PropEdge[], useInferred: boolean) {
  const out = new Map<string, { depth: number; via: PropEdge }>()
  let frontier = [...start]
  let depth = 0
  while (frontier.length && depth < 5) {
    depth++
    const next: string[] = []
    for (const s of frontier) for (const e of edges) {
      if (e.kind === 'inferred' && !useInferred) continue
      const src = typeof e.source === 'string' ? e.source : (e.source as unknown as N).id
      const tgt = typeof e.target === 'string' ? e.target : (e.target as unknown as N).id
      if (src === s && !start.includes(tgt) && !out.has(tgt)) { out.set(tgt, { depth, via: e }); next.push(tgt) }
    }
    frontier = next
  }
  return out
}

export default function RiskPropagation() {
  const { team, version } = useApp()
  const g = useAsync(() => api.propagation(team), [team, version])
  const ds = useAsync(() => api.decisions(team), [team, version])
  const [sel, setSel] = useState<string | null>(null)
  const [change, setChange] = useState('')
  const [inferred, setInferred] = useState(true)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [, tick] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<Simulation<N, L> | null>(null)
  const drag = useRef<{ node?: N; pan?: { x: number; y: number; vx: number; vy: number } } | null>(null)

  const graph = useMemo(() => {
    if (!g.data) return null
    const nodes: N[] = g.data.nodes.map((n) => ({ ...n }))
    const links: L[] = g.data.edges.filter((e) => inferred || e.kind !== 'inferred').map((e) => ({ ...e }))
    return { nodes, links }
  }, [g.data, inferred])

  useEffect(() => {
    if (!graph) return
    const sim = forceSimulation<N, L>(graph.nodes)
      .force('link', forceLink<N, L>(graph.links).id((d) => d.id).distance(150).strength(0.5))
      .force('charge', forceManyBody().strength(-1100))
      .force('x', forceX(W / 2).strength(0.04)).force('y', forceY(H / 2).strength(0.08))
      .force('collide', forceCollide(46))
    let raf = 0
    sim.on('tick', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => tick((t) => t + 1)) })
    simRef.current = sim
    return () => { sim.stop(); cancelAnimationFrame(raf) }
  }, [graph])

  const decision = ds.data?.find((d) => d.id === change)
  const origin = decision ? decision.services : sel ? [sel] : []
  const blast = useMemo(() => (g.data && origin.length ? downstream(origin, g.data.edges, inferred) : new Map()), [g.data, origin.join(), inferred])
  const node = g.data?.nodes.find((n) => n.id === sel)
  const toLocal = (e: React.PointerEvent | React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k, sx, sy }
  }
  const zoom = (f: number, cx = W / 2, cy = H / 2) => setView((v) => { const k = Math.min(3, Math.max(0.4, v.k * f)); return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k } })
  const edgesOf = (id: string) => g.data?.edges.filter((e) => e.source === id || e.target === id) || []

  return (
    <div>
      <PageHeader title="Risk Propagation" description="How a change or failure in one service can spread to the services that depend on it, using declared dependencies, incidents that actually spread, and clearly labelled inferred links."
        meta={<><Badge tone="red" icon={<Share2 className="h-3 w-3" />}>Dependency-aware</Badge><SourceBadge source="seed" /></>} />
      <Card className="mb-3 flex flex-col gap-3 p-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs">
          <span className="text-sub">Simulate a change:</span>
          <Select label="Decision" value={change} onChange={(v) => { setChange(v); setSel(null) }}
            options={[{ value: '', label: 'Pick a decision…' }, ...(ds.data || []).filter((d) => d.services.length).map((d) => ({ value: d.id, label: `${d.id} · ${d.title.slice(0, 48)}` }))]} className="w-full min-w-0 max-w-[420px] sm:w-auto" />
          {change && <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setChange('')}>Clear</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-2xs text-sub">
          {(['declared', 'observed', 'inferred'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: k === 'inferred' ? 'transparent' : EDGE[k], borderTop: k === 'inferred' ? `2px dashed ${EDGE[k]}` : undefined }} />{k}{g.data && <span className="hidden text-faint 2xl:inline">· {g.data.legend[k]}</span>}</span>))}
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={inferred} onChange={(e) => setInferred(e.target.checked)} />show inferred</label>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="relative overflow-hidden">
          {g.loading && <LoadingBlock rows={10} label="Mapping service dependencies" />}
          {g.error && <ErrorState error={g.error} onRetry={g.reload} />}
          {graph && (
            <>
              <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-[60vh] min-h-[420px] w-full cursor-grab touch-none select-none active:cursor-grabbing" role="img" aria-label="Service dependency graph"
                onWheel={(e) => { const p = toLocal(e); zoom(e.deltaY < 0 ? 1.12 : 0.89, p.sx, p.sy) }}
                onPointerDown={(e) => { if ((e.target as Element).getAttribute('data-bg')) { drag.current = { pan: { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y } }; svgRef.current!.setPointerCapture(e.pointerId) } }}
                onPointerMove={(e) => {
                  const d = drag.current; if (!d) return
                  if (d.node) { const p = toLocal(e); d.node.fx = p.x; d.node.fy = p.y; simRef.current?.alphaTarget(0.25).restart() }
                  else if (d.pan) { const r = svgRef.current!.getBoundingClientRect(); setView((v) => ({ ...v, x: d.pan!.vx + ((e.clientX - d.pan!.x) / r.width) * W, y: d.pan!.vy + ((e.clientY - d.pan!.y) / r.height) * H })) }
                }}
                onPointerUp={() => { if (drag.current?.node) { drag.current.node.fx = null; drag.current.node.fy = null; simRef.current?.alphaTarget(0) } drag.current = null }}>
                <defs>{Object.entries(EDGE).map(([k, c]) => (
                  <marker key={k} id={`arr-${k}`} viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={c} /></marker>))}</defs>
                <rect data-bg="1" width={W} height={H} fill="transparent" />
                <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                  {graph.links.map((l, i) => {
                    const s = l.source as N, t = l.target as N
                    const inBlast = origin.length > 0 && (origin.includes(s.id) || blast.has(s.id)) && blast.has(t.id)
                    const dim = origin.length > 0 && !inBlast
                    return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={EDGE[l.kind]} strokeWidth={inBlast ? 2.6 : l.kind === 'observed' ? 1.8 : 1.2}
                      strokeDasharray={l.kind === 'inferred' ? '4 4' : undefined} markerEnd={`url(#arr-${l.kind})`} opacity={dim ? 0.12 : 0.85} />
                  })}
                  {graph.nodes.map((n) => {
                    const isOrigin = origin.includes(n.id), hit = blast.get(n.id)
                    const dim = origin.length > 0 && !isOrigin && !hit
                    const r = n.tier === 'critical' ? 15 : 11
                    return (
                      <g key={n.id} transform={`translate(${n.x ?? 0},${n.y ?? 0})`} opacity={dim ? 0.25 : 1} className="cursor-pointer"
                        onPointerDown={(e) => { e.stopPropagation(); drag.current = { node: n }; svgRef.current!.setPointerCapture(e.pointerId) }}
                        onClick={() => { setSel(n.id); setChange('') }}>
                        {(isOrigin || hit) && <circle r={r + 7} fill="none" stroke={isOrigin ? '#e6eaf2' : '#ef4444'} strokeWidth={1.5} strokeDasharray={hit ? '3 2' : undefined} />}
                        <circle r={r} fill={riskFill(n.risk)} stroke={n.catalogued ? '#0a0e17' : '#97a3b8'} strokeWidth={2} strokeDasharray={n.catalogued ? undefined : '2 2'} />
                        {n.sev1 > 0 && <text textAnchor="middle" y={4} fontSize={10} fontWeight={700} fill="#fff">{n.sev1}</text>}
                        <text y={r + 14} textAnchor="middle" fontSize={11} fill="#e6eaf2" style={{ paintOrder: 'stroke', stroke: '#111724', strokeWidth: 4 }}>{n.id}</text>
                      </g>
                    )
                  })}
                </g>
              </svg>
              <div className="absolute bottom-3 left-3 flex gap-1 rounded-lg border border-line2 bg-panel/90 p-1">
                <Button size="sm" variant="ghost" aria-label="Zoom in" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => zoom(1.2)} />
                <Button size="sm" variant="ghost" aria-label="Zoom out" icon={<Minus className="h-3.5 w-3.5" />} onClick={() => zoom(0.83)} />
                <Button size="sm" variant="ghost" aria-label="Reset view" icon={<Maximize2 className="h-3.5 w-3.5" />} onClick={() => setView({ x: 0, y: 0, k: 1 })} />
              </div>
              <div className="absolute bottom-3 right-3 hidden rounded-lg border border-line2 bg-panel/90 px-3 py-2 text-2xs text-sub md:block">Node colour = incident history · number = SEV1s · larger = critical tier · dashed outline = not in catalogue</div>
            </>
          )}
        </Card>
        <Card className="max-h-[72vh] overflow-y-auto">
          {decision ? (
            <div className="p-5">
              <Badge tone="blue">Simulated change</Badge>
              <h3 className="mt-2 text-base font-semibold leading-snug"><span className="mr-1.5 font-mono text-sm text-sub">{decision.id}</span>{decision.title}</h3>
              <p className="mt-2 text-xs text-sub">Touches {decision.services.join(', ')}. A failure here could reach <b className="text-fg">{blast.size}</b> other service{blast.size === 1 ? '' : 's'}.</p>
              <Blast blast={blast} />
            </div>
          ) : node ? (
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5"><Badge tone={node.tier === 'critical' ? 'red' : 'neutral'} className="capitalize">{node.tier}</Badge>
                  {node.runbook === false && <Badge tone="amber" icon={<BookOpen className="h-3 w-3" />}>no runbook</Badge>}{!node.catalogued && <Badge>not catalogued</Badge>}</div>
                <button onClick={() => setSel(null)} className="text-faint hover:text-fg" aria-label="Clear selection"><X className="h-4 w-4" /></button>
              </div>
              <h3 className="mt-2 font-mono text-base font-semibold">{node.id}</h3>
              <Section title="Connected services">
                <ul className="space-y-1">{edgesOf(node.id).map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: EDGE[e.kind] }} />
                    <span><span className="font-mono">{e.source === node.id ? `→ ${e.target}` : `← ${e.source}`}</span> <span className="text-faint">· {e.why}</span></span></li>))}</ul>
              </Section>
              <Section title="Potential impact">
                <p className="text-xs text-sub">{blast.size ? <>A failure in <span className="font-mono text-fg">{node.id}</span> can propagate to <b className="text-fg">{blast.size}</b> service(s).</> : 'Nothing depends on this service in the recorded data.'}</p>
                <Blast blast={blast} />
              </Section>
              <Section title="Previous incidents">{node.incidents.length ? <div className="flex flex-wrap gap-1">{node.incidents.map((r) => <Ref key={r} id={r} />)}</div> : <p className="text-xs text-sub">None recorded.</p>}</Section>
              <Section title="Related decisions">{node.decisions.length ? <div className="flex flex-wrap gap-1">{node.decisions.map((r) => <Ref key={r} id={r} />)}</div> : <p className="text-xs text-sub">None recorded.</p>}</Section>
              {node.decision_incidents.length > 0 && <Section title="Historical evidence">
                <p className="text-xs text-sub">Decisions on this service led to {node.decision_incidents.length} incident(s):</p>
                <div className="mt-1 flex flex-wrap gap-1">{node.decision_incidents.map((r) => <Ref key={r} id={r} />)}</div></Section>}
            </div>
          ) : (
            <EmptyState icon={<Share2 className="h-5 w-5" />} title="Select a service or simulate a change" body="Click a service to see what depends on it, or pick a decision above to see its blast radius." />
          )}
        </Card>
      </div>
    </div>
  )
}

function Blast({ blast }: { blast: Map<string, { depth: number; via: PropEdge }> }) {
  if (!blast.size) return null
  return (
    <ul className="mt-2 space-y-1.5">
      {[...blast.entries()].sort((a, b) => a[1].depth - b[1].depth).map(([s, v]) => (
        <li key={s} className={cn('flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs', v.via.kind === 'observed' ? 'border-crit/30 bg-crit-soft/30' : 'border-line bg-bg/40')}>
          {v.via.kind === 'observed' && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crit" />}
          <div className="min-w-0"><div><span className="font-mono">{s}</span> <span className="text-faint">· hop {v.depth} · {v.via.kind}</span></div>
            <div className="text-2xs text-faint">{v.via.why}</div></div>
          {v.via.ref && <Ref id={v.via.ref} className="ml-auto" />}
        </li>
      ))}
    </ul>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mt-4"><div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-faint">{title}</div>{children}</div>
}
