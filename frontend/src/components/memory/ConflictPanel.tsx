import { AlertTriangle, CheckCircle2, GitCompareArrows, Sparkles, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Ref, SourceBadge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp } from '@/state/app'
import type { ConflictSide, MemoryConflict } from '@/types'

const fmt = (v: unknown) => (v == null ? '—' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v))

/** Two historical memories that disagree, the context that differs, and a recommendation that doesn't pick a side blindly. */
export function ConflictPanel({ c, compact }: { c: MemoryConflict; compact?: boolean }) {
  const { team, toast } = useApp()
  const [llm, setLlm] = useState<Awaited<ReturnType<typeof api.explainConflict>> | null>(null)
  const [busy, setBusy] = useState(false)
  const ask = async () => {
    setBusy(true)
    try { setLlm(await api.explainConflict(team, c.id)) } catch (e) { toast('error', 'Could not explain the conflict', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="overflow-hidden rounded-xl border border-warn/40 bg-warn-soft/15">
      <div className="flex flex-wrap items-center gap-2 border-b border-warn/30 bg-warn-soft/30 px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 text-warn" />
        <span className="text-xs font-semibold uppercase tracking-wider text-warn-fg">Conflict detected</span>
        <Badge tone="amber" className="capitalize">{c.type === 'fix' ? 'Fix outcome' : 'Assumption'}</Badge>
        <span className="text-sm text-fg">{c.summary}</span>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <Side s={c.a} good tag="Historical memory A" />
        <Side s={c.b} tag="Historical memory B" />
      </div>
      {c.others.length > 0 && !compact && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 text-2xs text-sub">Also on record: {c.others.map((o) => (
          <span key={o.ref + o.action} className="inline-flex items-center gap-1"><Ref id={o.ref} /><span className={o.result === 'resolved' || o.result === 'held' ? 'text-ok-fg' : 'text-crit-fg'}>{o.result}</span></span>))}</div>
      )}
      <div className="border-t border-warn/20 px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-faint"><GitCompareArrows className="h-3.5 w-3.5" />Context differences</div>
        {c.context_differences.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-faint"><th className="py-1 pr-3 font-medium" /><th className="py-1 pr-3 font-medium">A · {c.a.ref}</th><th className="py-1 font-medium">B · {c.b.ref}</th></tr></thead>
              <tbody>{c.context_differences.map((d) => (
                <tr key={d.field} className={cn('border-t border-line/50', d.differs && 'text-fg', !d.differs && 'text-faint')}>
                  <td className="py-1.5 pr-3 capitalize text-sub">{d.field.replace(/_/g, ' ')}{d.computed && <Badge className="ml-1.5" tone="blue">computed</Badge>}</td>
                  <td className="py-1.5 pr-3 font-mono">{fmt(d.a)}</td><td className="py-1.5 font-mono">{fmt(d.b)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <p className="text-xs text-sub">No operating context was recorded for these incidents.</p>}
        {c.missing_context.length > 0 && <p className="mt-2 text-2xs text-faint">No context recorded for {c.missing_context.join(', ')}, so they can't be compared.</p>}
        {c.explanation && <p className="mt-3 rounded-lg border border-line bg-bg/50 p-3 text-xs text-fg/90"><span className="font-medium text-primary-fg">Why the outcomes differ: </span>{c.explanation}</p>}
      </div>
      <div className="border-t border-warn/20 bg-bg/30 px-4 py-3">
        <div className="text-2xs font-medium uppercase tracking-wide text-faint">Final recommendation</div>
        <p className="mt-1 text-sm">{c.recommendation}</p>
        {!compact && (
          <div className="mt-3">
            {!llm && <Button size="sm" variant="secondary" loading={busy} icon={<Sparkles className="h-3.5 w-3.5" />} onClick={ask}>Ask the AI to analyse this conflict</Button>}
            {llm && (llm.available && llm.llm ? (
              <div className="space-y-1.5 rounded-lg border border-memory/25 bg-memory-soft/20 p-3 text-xs">
                <p><span className="font-medium text-memory-fg">Why: </span>{llm.llm.why}</p>
                {llm.llm.unknowns?.length > 0 && <p><span className="font-medium text-memory-fg">Still unknown: </span>{llm.llm.unknowns.join('; ')}</p>}
                <p><span className="font-medium text-memory-fg">Recommendation: </span>{llm.llm.recommendation}</p>
              </div>
            ) : <p className="text-xs text-warn-fg">{llm.message}</p>)}
          </div>
        )}
        {!compact && c.memories && c.memories.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-2xs text-faint">Recalled from memory for this conflict</div>
            {c.memories.slice(0, 3).map((m, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-memory/15 bg-memory-soft/10 p-2 text-2xs text-sub">
                <span className="line-clamp-2 flex-1">{m.text}</span><SourceBadge source={m.source || 'hindsight'} />
              </div>
            ))}
          </div>
        )}
        {c.recall_error && <p className="mt-2 text-2xs text-crit-fg">Hindsight recall failed for this conflict: {c.recall_error}</p>}
      </div>
    </div>
  )
}

function Side({ s, good, tag }: { s: ConflictSide; good?: boolean; tag: string }) {
  const ok = s.result === 'resolved' || s.result === 'held'
  return (
    <div className={cn('rounded-lg border p-3', ok ? 'border-ok/30 bg-ok-soft/25' : 'border-crit/30 bg-crit-soft/25')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-medium uppercase tracking-wide text-faint">{tag}</span>
        <Ref id={s.ref} />
      </div>
      <div className="mt-2 text-sm font-medium">{s.action}</div>
      <div className={cn('mt-1 flex items-center gap-1.5 text-xs font-medium', ok ? 'text-ok-fg' : 'text-crit-fg')}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{s.label} · {s.result}
      </div>
      <div className="mt-1.5 text-xs text-sub">{s.title} <span className="text-faint">· {s.service}</span></div>
      {s.root_cause && <div className="mt-1 text-2xs text-faint">{good ? 'Root cause' : 'Context'}: {s.root_cause}</div>}
    </div>
  )
}
