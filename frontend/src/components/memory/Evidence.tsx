import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, BrainCircuit, ChevronDown, Clock3, History, Lightbulb, Link2, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Memory, Warning } from '@/types'
import { Badge, Confidence, Ref, SourceBadge } from '@/components/ui'

const KIND: Record<Warning['type'], { label: string; icon: ReactNode }> = {
  estimate: { label: 'Team estimation pattern', icon: <Clock3 className="h-3.5 w-3.5" /> },
  assumption: { label: 'Previously failed assumption', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  ignored_warning: { label: 'Ignored warning', icon: <Users className="h-3.5 w-3.5" /> },
  incident_link: { label: 'Decision → incident link', icon: <Link2 className="h-3.5 w-3.5" /> },
  insight: { label: 'Pattern from memory', icon: <Lightbulb className="h-3.5 w-3.5" /> },
}
const sevBar = { high: 'bg-crit', medium: 'bg-warn', low: 'bg-faint' }

/** A memory-backed recommendation: retrieved decisions, what happened previously, why it matters now, confidence. */
export function EvidenceCard({ w, defaultOpen = false, index = 0 }: { w: Warning; defaultOpen?: boolean; index?: number }) {
  const [open, setOpen] = useState(defaultOpen)
  const k = KIND[w.type] || KIND.insight
  const refs = [...new Set(w.evidence)]
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
      className="relative overflow-hidden rounded-xl border border-line bg-bg/40">
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', sevBar[w.severity])} />
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-raised/40">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-sub">
            <span className="flex items-center gap-1 text-memory-fg">{k.icon}{k.label}</span>
            <Badge tone={w.severity === 'high' ? 'red' : w.severity === 'medium' ? 'amber' : 'neutral'}>{w.severity}</Badge>
          </div>
          <div className="mt-1.5 text-sm font-medium leading-snug">{w.title}</div>
          {!open && <div className="mt-1 line-clamp-1 text-xs text-sub">{w.detail}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {w.confidence != null && <Confidence value={w.confidence} className="hidden sm:flex" />}
          <ChevronDown className={cn('h-4 w-4 text-faint transition-transform', open && 'rotate-180')} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="grid gap-3 border-t border-line px-4 py-4 text-sm md:grid-cols-2">
              <Block icon={<History className="h-3.5 w-3.5" />} title="Retrieved from memory">
                <div className="flex flex-wrap gap-1.5">{refs.map((r) => <Ref key={r} id={r} />)}</div>
                <p className="mt-2 text-xs text-sub">{w.detail}</p>
              </Block>
              <Block icon={<Clock3 className="h-3.5 w-3.5" />} title="What happened previously">
                <p className="text-xs text-sub">{w.previously || w.detail}</p>
              </Block>
              <Block icon={<Lightbulb className="h-3.5 w-3.5" />} title="Why it matters now">
                <p className="text-xs text-sub">{w.why_now || '—'}</p>
              </Block>
              <Block icon={<BrainCircuit className="h-3.5 w-3.5" />} title="Confidence">
                {w.confidence != null ? <Confidence value={w.confidence} /> : <span className="text-xs text-sub">—</span>}
                <p className="mt-1.5 text-2xs text-faint">From how often this pattern held in the team's past outcomes (Beta prior, updated per outcome).</p>
              </Block>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel/60 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-faint">{icon}{title}</div>
      {children}
    </div>
  )
}

/** One raw memory returned by Hindsight recall, expandable, with its source clearly labelled. */
export function MemoryItem({ m }: { m: Memory }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-memory/15 bg-memory-soft/15">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 px-3.5 py-3 text-left">
        <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-memory" />
        <div className="min-w-0 flex-1">
          <div className={cn('text-xs leading-relaxed text-fg/90', !open && 'line-clamp-2')}>{m.text}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {m.refs.map((r) => <Ref key={r} id={r} />)}
            {m.type && <Badge>{m.type}</Badge>}
            <SourceBadge source={m.source || 'hindsight'} />
          </div>
        </div>
        <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-1 border-t border-memory/15 px-3.5 py-2.5 font-mono text-2xs text-sub">
          {m.query && <div><span className="text-faint">recall query:</span> {m.query}</div>}
          {m.document_id && <div><span className="text-faint">document_id:</span> {m.document_id}</div>}
          {m.tags && m.tags.length > 0 && <div><span className="text-faint">tags:</span> {m.tags.join(', ')}</div>}
          {m.id && <div><span className="text-faint">memory id:</span> {m.id}</div>}
        </div>
      )}
    </div>
  )
}
