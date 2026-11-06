import { CheckCircle2, Cpu, Database, GitPullRequest, RotateCcw, Server, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge, Button, Card, CardHeader, Dialog, Field, PageHeader, SourceBadge } from '@/components/ui'
import { API_BASE, api } from '@/services/api'
import { useApp } from '@/state/app'

export default function Settings() {
  const { health, healthError, team, setTeam, refresh, toast } = useApp()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pr, setPr] = useState({ title: 'ADR-031: Kafka for settlements', body: 'Migrate settlement events to Kafka. Estimate 3 weeks.\nServices: payment-gateway, ledger-service\nAssumptions:\nNo schema changes needed\nWe can roll back by flipping the producer flag' })
  const [comment, setComment] = useState<string | null>(null)
  const [prBusy, setPrBusy] = useState(false)
  const reseed = async () => {
    setBusy(true)
    try {
      const r = await api.reseed()
      toast('memory', 'Demo memory reset', `Re-retained ${Object.values(r.retained).reduce((a, b) => a + b, 0)} memories across ${Object.keys(r.retained).length} banks`)
      refresh(); setConfirm(false)
    } catch (e) { toast('error', 'Reset failed', (e as Error).message) } finally { setBusy(false) }
  }
  const preview = async () => {
    setPrBusy(true)
    try { setComment((await api.prComment(team, pr.title, pr.body)).comment_markdown) } catch (e) { toast('error', 'Preview failed', (e as Error).message) } finally { setPrBusy(false) }
  }
  const live = health?.memory_mode === 'hindsight'
  return (
    <div>
      <PageHeader title="Settings" description="Connections, workspace and integrations." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Hindsight connection" icon={<Database className="h-4 w-4 text-memory" />} />
          <div className="space-y-3 p-5 text-sm">
            <Row k="Status" v={healthError ? <Status ok={false} t="API unreachable" /> : live ? <Status ok t="Connected to Hindsight API" /> : <Status ok={false} t="Not configured — local fallback store" />} />
            <Row k="Memory bank" v={<span className="font-mono">nexus-{team}</span>} />
            <Row k="Data source" v={health ? <SourceBadge source={health.memory_mode} /> : '—'} />
            <Row k="Records" v={health ? `${health.decisions} decisions · ${health.incidents} incidents` : '—'} />
            <Row k="Last memory error" v={health?.memory_last_error ? <span className="text-xs text-crit-fg">{health.memory_last_error}</span> : <span className="text-xs text-sub">none</span>} />
            {!live && <p className="rounded-lg border border-warn/30 bg-warn-soft/30 p-3 text-xs text-sub">Set <span className="font-mono text-fg">HINDSIGHT_URL</span> and <span className="font-mono text-fg">HINDSIGHT_API_KEY</span> in <span className="font-mono text-fg">backend/.env</span>, then restart the API and reset demo memory.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Model and API" icon={<Cpu className="h-4 w-4" />} />
          <div className="space-y-3 p-5 text-sm">
            <Row k="LLM" v={health?.llm_mode === 'groq' ? <Status ok t={`Groq · ${health.model}`} /> : <Status ok={false} t="Offline — deterministic rules only" />} />
            <Row k="Fallback" v="qwen/qwen3-32b, then rule-based output" />
            <Row k="API base URL" v={<span className="font-mono text-xs">{API_BASE}</span>} />
            <Row k="Numbers" v="Computed from history, never by the LLM" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Workspace" icon={<Server className="h-4 w-4" />} subtitle="Each workspace is its own Hindsight memory bank" />
          <div className="space-y-4 p-5">
            <Field label="Active workspace">
              <select className="input" value={team} onChange={(e) => setTeam(e.target.value)}>{(health?.teams || ['payments', 'platform']).map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-line bg-bg/40 p-3">
              <div><div className="text-sm font-medium">Reset demo memory</div><div className="text-xs text-sub">Deletes and recreates every bank from the seed data. Decisions and incidents you created are removed.</div></div>
              <Button variant="danger" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setConfirm(true)}>Reset</Button>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Pull request nudge" icon={<GitPullRequest className="h-4 w-4" />} subtitle="Preview the comment NEXUS posts on design-doc PRs (.github/workflows/nexus-premortem.yml)" />
          <div className="space-y-3 p-5">
            <Field label="PR title"><input className="input" value={pr.title} onChange={(e) => setPr({ ...pr, title: e.target.value })} /></Field>
            <Field label="PR description"><textarea className="input min-h-[96px] font-mono text-xs" value={pr.body} onChange={(e) => setPr({ ...pr, body: e.target.value })} /></Field>
            <Button variant="primary" loading={prBusy} onClick={preview}>Preview comment</Button>
            {comment && <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg p-3 font-mono text-2xs text-sub">{comment}</pre>}
          </div>
        </Card>
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Reset demo memory?" description="This deletes every memory bank and reloads the illustrative seed data."
        footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" loading={busy} onClick={reseed}>Reset memory</Button></>}>
        <p className="text-sm text-sub">Anything you created during this session (decisions, outcomes, incidents, feedback) will be removed. With Hindsight connected this re-runs retain for every record and can take a few minutes.</p>
        <div className="mt-3"><Badge tone="amber">Can't be undone</Badge></div>
      </Dialog>
    </div>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-b border-line/60 pb-2.5 last:border-0"><span className="text-xs text-sub">{k}</span><span className="text-right">{v}</span></div>
}
function Status({ ok, t }: { ok: boolean; t: string }) {
  return <span className="inline-flex items-center gap-1.5">{ok ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <XCircle className="h-4 w-4 text-warn" />}{t}</span>
}
