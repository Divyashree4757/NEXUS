import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, Award, BarChart3, Boxes, BrainCircuit, Dna, FlaskConical, GitCompareArrows, Library, RefreshCcw, Share2, ChevronsLeft, ChevronsRight, FolderKanban, Gauge, LayoutDashboard,
  Menu, Network, Search, Server, Settings, ShieldAlert, Siren, Target, Users, X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { RecordDrawer } from '@/components/memory/RecordDrawer'
import { Toasts } from '@/components/ui/Toasts'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp } from '@/state/app'
import type { Decision, Incident } from '@/types'

const NAV: { group: string; items: { to: string; label: string; icon: ReactNode }[] }[] = [
  { group: 'Intelligence', items: [
    { to: '/', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: '/decisions', label: 'Decision Intelligence', icon: <Target className="h-4 w-4" /> },
    { to: '/incidents', label: 'Incident Intelligence', icon: <Siren className="h-4 w-4" /> },
    { to: '/dna', label: 'Decision DNA', icon: <Dna className="h-4 w-4" /> },
    { to: '/propagation', label: 'Risk Propagation', icon: <Share2 className="h-4 w-4" /> },
    { to: '/whatif', label: 'What-If Simulator', icon: <FlaskConical className="h-4 w-4" /> },
  ] },
  { group: 'Memory', items: [
    { to: '/memory', label: 'Memory Explorer', icon: <BrainCircuit className="h-4 w-4" /> },
    { to: '/graph', label: 'Knowledge Graph', icon: <Network className="h-4 w-4" /> },
    { to: '/conflicts', label: 'Memory Conflicts', icon: <GitCompareArrows className="h-4 w-4" /> },
    { to: '/learning', label: 'Learning Engine', icon: <RefreshCcw className="h-4 w-4" /> },
    { to: '/knowledge', label: 'Knowledge Retention', icon: <Library className="h-4 w-4" /> },
    { to: '/scorecard', label: 'Memory Scorecard', icon: <Award className="h-4 w-4" /> },
  ] },
  { group: 'Analytics', items: [
    { to: '/analytics/risk', label: 'Risk Analytics', icon: <ShieldAlert className="h-4 w-4" /> },
    { to: '/analytics/accuracy', label: 'Prediction Accuracy', icon: <Gauge className="h-4 w-4" /> },
    { to: '/analytics/teams', label: 'Team Insights', icon: <Users className="h-4 w-4" /> },
  ] },
  { group: 'Management', items: [
    { to: '/projects', label: 'Projects', icon: <FolderKanban className="h-4 w-4" /> },
    { to: '/services', label: 'Services', icon: <Server className="h-4 w-4" /> },
    { to: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
  ] },
]

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary">
        <svg viewBox="0 0 32 32" className="h-5 w-5"><path d="M9 23V9l14 14V9" stroke="white" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      {!collapsed && <div className="leading-tight"><div className="text-sm font-semibold tracking-wide">NEXUS</div><div className="text-2xs text-faint">Engineering Intelligence</div></div>}
    </div>
  )
}

function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const { health, healthError, team, setTeam } = useApp()
  const teams = health?.teams || ['payments', 'platform']
  const live = health?.memory_mode === 'hindsight'
  return (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <div className="flex items-center justify-between">
        <Logo collapsed={collapsed} />
        {onToggle && !collapsed && <button onClick={onToggle} className="rounded-md p-1 text-faint hover:bg-raised hover:text-fg" aria-label="Collapse sidebar"><ChevronsLeft className="h-4 w-4" /></button>}
      </div>
      {collapsed && onToggle && <button onClick={onToggle} className="mx-auto rounded-md p-1 text-faint hover:bg-raised hover:text-fg" aria-label="Expand sidebar"><ChevronsRight className="h-4 w-4" /></button>}
      <nav className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1" aria-label="Main">
        {NAV.map((g) => (
          <div key={g.group}>
            {!collapsed && <div className="mb-1.5 px-2 text-2xs font-medium uppercase tracking-wider text-faint">{g.group}</div>}
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.to === '/'} onClick={onNavigate} title={collapsed ? it.label : undefined}
                  className={({ isActive }) => cn('group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                    collapsed && 'justify-center', isActive ? 'bg-raised text-fg' : 'text-sub hover:bg-raised/60 hover:text-fg')}>
                  {({ isActive }) => (<>
                    {isActive && <motion.span layoutId="nav-active" className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-primary" />}
                    <span className={cn(isActive ? 'text-primary' : 'text-faint group-hover:text-sub')}>{it.icon}</span>
                    {!collapsed && it.label}
                  </>)}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-line pt-3">
        <NavLink to="/settings" onClick={onNavigate} className={cn('flex items-center gap-2.5 rounded-lg border border-line bg-bg/40 px-2.5 py-2 hover:border-line2', collapsed && 'justify-center')}
          title="Hindsight connection">
          <span className="relative flex h-2 w-2 shrink-0">
            {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-50" />}
            <span className={cn('relative inline-flex h-2 w-2 rounded-full', healthError ? 'bg-crit' : live ? 'bg-ok' : 'bg-warn')} />
          </span>
          {!collapsed && <div className="min-w-0 text-2xs leading-tight">
            <div className="font-medium text-fg">{healthError ? 'API unreachable' : live ? 'Hindsight connected' : 'Hindsight not configured'}</div>
            <div className="truncate text-faint">{healthError ? 'Start the backend' : live ? `bank nexus-${team}` : 'using local fallback store'}</div>
          </div>}
        </NavLink>
        {!collapsed && (
          <label className="block">
            <span className="sr-only">Workspace</span>
            <select value={team} onChange={(e) => setTeam(e.target.value)} className="input h-9 py-0 text-xs">
              {teams.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)} workspace</option>)}
            </select>
          </label>
        )}
        <div className={cn('flex items-center gap-2.5 px-1 pt-1', collapsed && 'justify-center')}>
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-memory-soft text-2xs font-semibold text-memory-fg">EM</div>
          {!collapsed && <div className="text-2xs leading-tight"><div className="font-medium">Engineering Manager</div><div className="text-faint">Demo account</div></div>}
        </div>
      </div>
    </div>
  )
}

function GlobalSearch() {
  const { team } = useApp()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<{ d: Decision[]; i: Incident[] }>({ d: [], i: [] })
  useEffect(() => {
    if (!open || items.d.length) return
    Promise.all([api.decisions(team), api.incidents(team)]).then(([d, i]) => setItems({ d, i })).catch(() => { /* search just stays empty */ })
  }, [open, team, items.d.length])
  useEffect(() => setItems({ d: [], i: [] }), [team])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.getElementById('global-search')?.focus() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return [
      ...items.d.filter((d) => `${d.id} ${d.title} ${d.project} ${d.services.join(' ')}`.toLowerCase().includes(s)).slice(0, 5).map((d) => ({ id: d.id, title: d.title, to: `/decisions/${d.id}`, kind: 'Decision' })),
      ...items.i.filter((i) => `${i.id} ${i.title} ${i.service}`.toLowerCase().includes(s)).slice(0, 5).map((i) => ({ id: i.id, title: i.title, to: `/incidents/${i.id}`, kind: 'Incident' })),
    ]
  }, [q, items])
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search decisions, incidents, services…" className="input h-9 pl-9 pr-12" aria-label="Search" />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line2 px-1.5 text-2xs text-faint sm:block">Ctrl K</kbd>
      {open && q && (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-line2 bg-raised shadow-2xl">
          {hits.length ? hits.map((h) => (
            <button key={h.id} onMouseDown={() => { nav(h.to); setQ('') }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-line/60">
              <span className="w-14 shrink-0 font-mono text-2xs text-faint">{h.id}</span>
              <span className="flex-1 truncate">{h.title}</span>
              <span className="text-2xs text-faint">{h.kind}</span>
            </button>
          )) : <div className="px-3 py-3 text-xs text-sub">No decisions or incidents match “{q}”.</div>}
        </div>
      )}
    </div>
  )
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('nexus.sidebar') === '1' } catch { return false } })
  const [mobile, setMobile] = useState(false)
  const { health } = useApp()
  const loc = useLocation()
  useEffect(() => { try { localStorage.setItem('nexus.sidebar', collapsed ? '1' : '0') } catch { /* ignore */ } }, [collapsed])
  useEffect(() => { setMobile(false); window.scrollTo(0, 0) }, [loc.pathname])
  return (
    <div className="min-h-screen">
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-[#0c111c] transition-[width] duration-200 lg:block', collapsed ? 'w-[68px]' : 'w-[248px]')}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>
      <AnimatePresence>
        {mobile && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} />
            <motion.aside className="absolute inset-y-0 left-0 w-[264px] border-r border-line bg-[#0c111c]" initial={{ x: -264 }} animate={{ x: 0 }} exit={{ x: -264 }} transition={{ duration: 0.2 }}>
              <button onClick={() => setMobile(false)} className="absolute right-3 top-4 rounded-md p-1 text-sub" aria-label="Close menu"><X className="h-4 w-4" /></button>
              <Sidebar collapsed={false} onNavigate={() => setMobile(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-[248px]')}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-8">
          <button className="rounded-md p-1.5 text-sub hover:bg-raised lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <GlobalSearch />
          <div className="ml-auto hidden items-center gap-3 text-2xs text-sub md:flex">
            <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-faint" />{health ? `${health.decisions} decisions · ${health.incidents} incidents in memory` : '—'}</span>
            <span className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1"><Boxes className="h-3.5 w-3.5 text-faint" />{health?.llm_mode === 'groq' ? health.model : 'LLM offline · rule-based'}</span>
            <span className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1"><BarChart3 className="h-3.5 w-3.5 text-faint" />Seeded data is illustrative</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
      <RecordDrawer />
      <Toasts />
    </div>
  )
}
