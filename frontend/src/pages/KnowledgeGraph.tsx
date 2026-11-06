import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { Maximize2, Minus, Network, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Confidence, EmptyState, ErrorState, LoadingBlock, PageHeader, SourceBadge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { GraphEdge, GraphNode } from '@/types'

type N = GraphNode & SimulationNodeDatum
type L = SimulationLinkDatum<N> & { kind: string; why: string }

const KINDS: Record<string, { color: string; label: string; r: number }> = {
  decision: { color: '#3b82f6', label: 'Decisions', r: 8 },
  project: { color: '#e6eaf2', label: 'Projects', r: 10 },
  assumption: { color: '#f59e0b', label: 'Assumptions', r: 7 },
  incident: { color: '#ef4444', label: 'Incidents', r: 7 },
  root_cause: { color: '#f97316', label: 'Root causes', r: 5 },
  fix: { color: '#22c55e', label: 'Fixes', r: 6 },
  outcome: { color: '#64708a', label: 'Outcomes', r: 4.5 },
  lesson: { color: '#8b5cf6', label: 'Lessons', r: 9 },
}
const EDGE_COLOR: Record<string, string> = { caused: '#ef4444', 'failed in': '#f59e0b', resolved: '#22c55e', taught: '#8b5cf6', 'similar to': '#3b82f6' }
const W = 1200, H = 760

export default function KnowledgeGraph() {
  const { team, version } = useApp()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(() => api.graph(team), [team, version])
  const [hidden, setHidden] = useState<Record<string, boolean>>({ outcome: true })
  const [sel, setSel] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [, setTick] = useState(0)
  const simRef = useRef<Simulation<N, L> | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ node?: N; pan?: { x: number; y: number; vx: number; vy: number } } | null>(null)

  const graph = useMemo(() => {
    if (!data) return null
    const nodes: N[] = data.nodes.filter((n) => !hidden[n.kind]).map((n) => ({ ...n }))
    const ids = new Set(nodes.map((n) => n.id))
    const links: L[] = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e }))
    return { nodes, links }
  }, [data, hidden])

  useEffect(() => {
    if (!graph) return
    const sim = forceSimulation<N, L>(graph.nodes)
      .force('link', forceLink<N, L>(graph.links).id((d) => d.id).distance((l) => (l.kind === 'contains' ? 60 : l.kind === 'similar to' ? 110 : 70)).strength(0.5))
      .force('charge', forceManyBody().strength(-140))
      .force('center', forceCenter(W / 2, H / 2))
      .force('x', forceX(W / 2).strength(0.03)).force('y', forceY(H / 2).strength(0.04))
      .force('collide', forceCollide<N>((d) => (KINDS[d.kind]?.r || 6) + 6))
    let raf = 0
    sim.on('tick', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setTick((t) => t + 1)) })
    simRef.current = sim
    return () => { sim.stop(); cancelAnimationFrame(raf) }
  }, [graph])

  const toLocal = (e: React.PointerEvent | React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k, sx, sy }
  }
  const zoom = (f: number, cx = W / 2, cy = H / 2) => setView((v) => {
    const k = Math.min(3, Math.max(0.4, v.k * f))
    return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k }
  })

  const neighbors = useMemo(() => {
    const id = hover || sel
    if (!id || !graph) return null
    const s = new Set([id])
    graph.links.forEach((l) => { const a = (l.source as N).id, b = (l.target as N).id; if (a === id) s.add(b); if (b === id) s.add(a) })
    return s
  }, [hover, sel, graph, data])
  const selected = graph?.nodes.find((n) => n.id === sel)
  const selEdges = graph && sel ? graph.links.filter((l) => (l.source as N).id === sel || (l.target as N).id === sel) : []

  return (
    <div>
      <PageHeader title="Knowledge Graph" description="How decisions, assumptions, incidents, root causes, fixes and lessons connect across your engineering history."
        meta={<SourceBadge source="seed" />} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {Object.entries(KINDS).map(([k, v]) => (
          <button key={k} onClick={() => setHidden({ ...hidden, [k]: !hidden[k] })} aria-pressed={!hidden[k]}
            className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors', hidden[k] ? 'border-line text-faint' : 'border-line2 bg-raised text-fg')}>
            <span className="h-2 w-2 rounded-full" style={{ background: v.color, opacity: hidden[k] ? 0.3 : 1 }} />{v.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card className="relative overflow-hidden">
          {loading && <LoadingBlock rows={10} label="Building the graph" />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {graph && !graph.nodes.length && <EmptyState icon={<Network className="h-5 w-5" />} title="Nothing to show" body="Turn on at least one node type." />}
          {graph && graph.nodes.length > 0 && (
            <>
              <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-[62vh] min-h-[420px] w-full cursor-grab touch-none select-none active:cursor-grabbing" role="img" aria-label="Knowledge graph"
                onWheel={(e) => { const p = toLocal(e); zoom(e.deltaY < 0 ? 1.12 : 0.89, p.sx, p.sy) }}
                onPointerDown={(e) => { if ((e.target as Element).tagName === 'svg' || (e.target as Element).getAttribute('data-bg')) { drag.current = { pan: { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y } }; (e.currentTarget as Element).setPointerCapture(e.pointerId) } }}
                onPointerMove={(e) => {
                  const d = drag.current; if (!d) return
                  if (d.node) { const p = toLocal(e); d.node.fx = p.x; d.node.fy = p.y; simRef.current?.alphaTarget(0.25).restart() }
                  else if (d.pan) { const r = svgRef.current!.getBoundingClientRect(); setView((v) => ({ ...v, x: d.pan!.vx + ((e.clientX - d.pan!.x) / r.width) * W, y: d.pan!.vy + ((e.clientY - d.pan!.y) / r.height) * H })) }
                }}
                onPointerUp={() => { if (drag.current?.node) { drag.current.node.fx = null; drag.current.node.fy = null; simRef.current?.alphaTarget(0) } drag.current = null }}>
                <rect data-bg="1" width={W} height={H} fill="transparent" />
                <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                  {graph.links.map((l, i) => {
                    const s = l.source as N, t = l.target as N
                    const on = !neighbors || (neighbors.has(s.id) && neighbors.has(t.id))
                    return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={EDGE_COLOR[l.kind] || '#2d3950'} strokeWidth={l.kind === 'caused' ? 2 : 1}
                      strokeDasharray={l.kind === 'similar to' ? '3 3' : undefined} opacity={on ? (EDGE_COLOR[l.kind] ? 0.75 : 0.5) : 0.06} />
                  })}
                  {graph.nodes.map((n) => {
                    const k = KINDS[n.kind] || KINDS.outcome
                    const on = !neighbors || neighbors.has(n.id)
                    const showLabel = n.kind === 'project' || n.kind === 'lesson' || sel === n.id || hover === n.id || (neighbors && on && (hover || sel))
                    return (
                      <g key={n.id} transform={`translate(${n.x ?? 0},${n.y ?? 0})`} opacity={on ? 1 : 0.15} className="cursor-pointer"
                        onPointerDown={(e) => { e.stopPropagation(); drag.current = { node: n }; (svgRef.current as Element).setPointerCapture(e.pointerId) }}
                        onClick={() => setSel(n.id === sel ? null : n.id)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                        {n.kind === 'incident' ? <rect x={-k.r} y={-k.r} width={k.r * 2} height={k.r * 2} rx={2} fill={k.color} />
                          : n.kind === 'assumption' ? <polygon points={`0,${-k.r - 2} ${k.r + 2},0 0,${k.r + 2} ${-k.r - 2},0`} fill={k.color} />
                          : n.kind === 'project' ? <circle r={k.r} fill="#0a0e17" stroke={k.color} strokeWidth={2} />
                          : <circle r={k.r} fill={k.color} />}
                        {sel === n.id && <circle r={k.r + 5} fill="none" stroke="#e6eaf2" strokeWidth={1.5} />}
                        {showLabel && <text y={-k.r - 6} textAnchor="middle" fontSize={11} fill="#e6eaf2" style={{ paintOrder: 'stroke', stroke: '#111724', strokeWidth: 4 }}>
                          {(n.kind === 'decision' || n.kind === 'incident' ? `${n.id} ` : '') + String(n.label).slice(0, 42)}</text>}
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
              <div className="absolute bottom-3 right-3 hidden rounded-lg border border-line2 bg-panel/90 px-3 py-2 text-2xs text-sub md:block">Scroll to zoom · drag the background to pan · drag nodes · click for details</div>
            </>
          )}
        </Card>
        <Card className="max-h-[70vh] overflow-y-auto">
          {!selected ? (
            <EmptyState icon={<Network className="h-5 w-5" />} title="Select a node" body="Click any decision, incident, assumption or lesson to see what it's connected to and why." />
          ) : (
            <div className="p-5">
              <div className="flex items-start justify-between gap-2">
                <Badge className="capitalize">{selected.kind.replace('_', ' ')}</Badge>
                <button onClick={() => setSel(null)} className="text-faint hover:text-fg" aria-label="Clear selection"><X className="h-4 w-4" /></button>
              </div>
              <h3 className="mt-2 text-base font-semibold leading-snug">{(selected.kind === 'decision' || selected.kind === 'incident') && <span className="mr-1.5 font-mono text-sm text-sub">{selected.id}</span>}{String(selected.label)}</h3>
              {typeof selected.confidence === 'number' && <Confidence value={selected.confidence} className="mt-2" />}
              {typeof selected.ratio === 'number' && <div className="mt-1 text-xs text-sub">{selected.ratio}x estimate</div>}
              {typeof selected.broke === 'number' && <div className="mt-1 text-xs text-sub">broke {String(selected.broke)} of {String(selected.made)} times</div>}
              {(selected.kind === 'decision' || selected.kind === 'incident') && (
                <Button size="sm" variant="primary" className="mt-3" onClick={() => nav(selected.kind === 'decision' ? `/decisions/${selected.id}` : `/incidents/${selected.id}`)}>Open {selected.kind}</Button>
              )}
              <div className="mt-5 text-2xs font-medium uppercase tracking-wide text-faint">Relationships ({selEdges.length})</div>
              <ul className="mt-2 space-y-2">
                {selEdges.map((e, i) => {
                  const s = e.source as N, t = e.target as N
                  const other = s.id === sel ? t : s
                  return (
                    <li key={i}>
                      <button onClick={() => setSel(other.id)} className="w-full rounded-lg border border-line bg-bg/40 p-2.5 text-left hover:border-line2">
                        <div className="flex items-center gap-1.5 text-2xs">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: EDGE_COLOR[e.kind] || '#64708a' }} />
                          <span className="text-sub">{s.id === sel ? 'this' : (KINDS[s.kind]?.label || s.kind).replace(/s$/, '').toLowerCase()}</span>
                          <span className="font-medium text-fg">{e.kind}</span>
                          <span className="text-sub">{t.id === sel ? 'this' : (KINDS[t.kind]?.label || t.kind).replace(/s$/, '').toLowerCase()}</span>
                        </div>
                        <div className="mt-1 text-xs">{(other.kind === 'decision' || other.kind === 'incident') && <span className="mr-1 font-mono text-faint">{other.id}</span>}{String(other.label).slice(0, 80)}</div>
                        <div className="mt-0.5 text-2xs text-faint">{(e as unknown as GraphEdge).why}</div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
