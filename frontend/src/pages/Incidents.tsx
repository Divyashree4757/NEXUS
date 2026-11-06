import { CheckCircle2, Clock, Plus, Repeat2, Search, Siren } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, type Column, DataTable, Dialog, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, Ref, Select, SeverityBadge, SourceBadge, Stat } from '@/components/ui'
import { fmtDate } from '@/lib/utils'
import { api } from '@/services/api'
import { useApp, useAsync } from '@/state/app'
import type { Incident } from '@/types'

export default function Incidents() {
  const { team, version } = useApp()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data, error, loading, reload } = useAsync(() => api.incidents(team), [team, version])
  const [qText, setQ] = useState('')
  const [sev, setSev] = useState('all')
  const [status, setStatus] = useState('all')
  const [service, setService] = useState('all')

  const services = useMemo(() => [...new Set((data || []).map((i) => i.service))].sort(), [data])
  const rows = useMemo(() => (data || []).filter((i) =>
    (sev === 'all' || i.severity === sev) && (status === 'all' || i.status === status) && (service === 'all' || i.service === service) &&
    (!qText || `${i.id} ${i.title} ${i.service} ${i.root_cause ?? ''}`.toLowerCase().includes(qText.toLowerCase()))), [data, sev, status, service, qText])
  const resolved = (data || []).filter((i) => i.status === 'resolved')
  const ttr = resolved.filter((i) => i.ttr_minutes)
  const avgTtr = ttr.length ? Math.round(ttr.reduce((a, i) => a + (i.ttr_minutes || 0), 0) / ttr.length) : null

  const columns: Column<Incident>[] = [
    { key: 'id', header: 'Incident ID', render: (i) => <span className="font-mono text-xs text-sub">{i.id}</span>, sort: (i) => i.id },
    { key: 'title', header: 'Incident', render: (i) => <div className="max-w-[320px]"><div className="truncate font-medium">{i.title}</div><div className="truncate font-mono text-2xs text-faint">{i.error_signature}</div></div>, sort: (i) => i.title },
    { key: 'service', header: 'Service', render: (i) => <Badge>{i.service}</Badge>, sort: (i) => i.service, hideOnMobile: true },
    { key: 'sev', header: 'Severity', render: (i) => <SeverityBadge sev={i.severity} />, sort: (i) => i.severity },
    { key: 'rc', header: 'Root cause', render: (i) => <span className="line-clamp-2 max-w-[260px] text-xs text-sub">{i.root_cause || 'Under investigation'}</span>, hideOnMobile: true },
    { key: 'status', header: 'Resolution', render: (i) => <Badge tone={i.status === 'resolved' ? 'green' : 'amber'}>{i.status === 'resolved' ? `Resolved${i.ttr_minutes ? ` · ${i.ttr_minutes}m` : ''}` : 'Open'}</Badge>, sort: (i) => i.status },
    { key: 'similar', header: 'Similar history', sort: (i) => i.similar_count, hideOnMobile: true,
      render: (i) => i.similar_ids?.length ? <div className="flex flex-wrap gap-1">{i.similar_ids.slice(0, 3).map((s) => <Ref key={s} id={s} />)}{i.similar_ids.length > 3 && <span className="text-2xs text-faint">+{i.similar_ids.length - 3}</span>}</div> : <span className="text-2xs text-faint">first of its kind</span> },
    { key: 'date', header: 'Timestamp', render: (i) => <span className="tnum text-xs text-sub">{fmtDate(i.date)}</span>, sort: (i) => i.date, hideOnMobile: true },
  ]

  return (
    <div>
      <PageHeader title="Incident Intelligence" description="Learn from every failure. Prevent the next one."
        meta={<><Badge tone="red">RECALL-X</Badge><SourceBadge source="seed" /></>}
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>Create incident</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat loading={loading} label="Total incidents" value={data?.length ?? '—'} icon={<Siren className="h-4 w-4" />} accent="red" />
        <Stat loading={loading} label="Resolved incidents" value={resolved.length} sub={data && `${data.length - resolved.length} open`} icon={<CheckCircle2 className="h-4 w-4" />} accent="green" />
        <Stat loading={loading} label="Recurring incidents" value={(data || []).filter((i) => i.recurring).length} sub="matched an earlier incident" icon={<Repeat2 className="h-4 w-4" />} accent="amber" />
        <Stat loading={loading} label="Average resolution time" value={avgTtr != null ? `${avgTtr}m` : '—'} icon={<Clock className="h-4 w-4" />} />
      </div>
      <Card>
        <div className="flex flex-col gap-2 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input value={qText} onChange={(e) => setQ(e.target.value)} placeholder="Search incidents, services, root causes" className="input h-9 pl-9" aria-label="Search incidents" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select label="Service" value={service} onChange={setService} options={[{ value: 'all', label: 'All services' }, ...services.map((s) => ({ value: s, label: s }))]} />
            <Select label="Severity" value={sev} onChange={setSev} options={[{ value: 'all', label: 'Any severity' }, ...['SEV1', 'SEV2', 'SEV3'].map((s) => ({ value: s, label: s }))]} />
            <Select label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Any status' }, { value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }]} />
          </div>
        </div>
        {loading && <LoadingBlock rows={8} label="Loading incident history" />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && <DataTable rows={rows} columns={columns} rowKey={(i) => i.id} onRowClick={(i) => nav(`/incidents/${i.id}`)} initialSort={{ key: 'date', dir: 'desc' }}
          empty={<EmptyState icon={<Siren className="h-5 w-5" />} title="No incidents match" body="Try another filter, or create an incident to investigate." />} />}
      </Card>
      <CreateIncidentDialog open={params.get('new') === '1'} onClose={() => setParams({})} services={services} />
    </div>
  )
}

const SAMPLE = {
  title: 'Payment API latency up and DB timeouts', service: 'payment-gateway', severity: 'SEV1',
  logs: '2026-11-06T14:05:11Z payment-gateway WARN  latency p99 3100ms above SLO\n2026-11-06T14:05:47Z payment-gateway ERROR HikariPool-1 - Connection is not available, request timed out after 30000ms\n2026-11-06T14:06:02Z payment-gateway ERROR HikariPool-1 - Connection is not available, request timed out after 30000ms',
  symptoms: 'payment failures 9%, p99 3.1s, started after evening traffic ramp',
}

function CreateIncidentDialog({ open, onClose, services }: { open: boolean; onClose: () => void; services: string[] }) {
  const { team, toast, refresh } = useApp()
  const nav = useNavigate()
  const [f, setF] = useState({ title: '', service: '', severity: 'SEV2', logs: '', symptoms: '' })
  const [busy, setBusy] = useState(false)
  const valid = f.title.trim().length >= 3 && f.service.trim()
  const submit = async () => {
    setBusy(true)
    try {
      const i = await api.createIncident({ team, title: f.title.trim(), service: f.service.trim(), severity: f.severity,
        logs: f.logs.split('\n').map((l) => l.trim()).filter(Boolean), symptoms: f.symptoms.split(',').map((s) => s.trim()).filter(Boolean) })
      toast('success', `${i.id} opened`, 'RECALL-X is searching incident memory…')
      refresh(); onClose(); setF({ title: '', service: '', severity: 'SEV2', logs: '', symptoms: '' })
      nav(`/incidents/${i.id}`)
    } catch (e) { toast('error', 'Could not create the incident', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} wide title="Create incident" description="Paste the alert and a few log lines. RECALL-X will match it against every incident your team has resolved."
      footer={<><Button variant="ghost" className="mr-auto" onClick={() => setF(SAMPLE)}>Fill with sample</Button><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>Create and investigate</Button></>}>
      <div className="space-y-4">
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What's broken?" autoFocus /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service">
            <input className="input" list="svc" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })} placeholder="payment-gateway" />
            <datalist id="svc">{services.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Severity"><select className="input" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
            <option value="SEV1">SEV1 · customer-facing outage</option><option value="SEV2">SEV2 · degraded</option><option value="SEV3">SEV3 · minor</option></select></Field>
        </div>
        <Field label="Error logs" hint="One line per log entry"><textarea className="input min-h-[120px] font-mono text-xs" value={f.logs} onChange={(e) => setF({ ...f, logs: e.target.value })} /></Field>
        <Field label="Symptoms" hint="Comma separated"><input className="input" value={f.symptoms} onChange={(e) => setF({ ...f, symptoms: e.target.value })} /></Field>
      </div>
    </Dialog>
  )
}
