// Shapes returned by the NEXUS FastAPI backend (backend/app/*). Kept loose where the backend is loose.

export type Team = string
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'
export type Severity = 'SEV1' | 'SEV2' | 'SEV3'
export type FixResult = 'resolved' | 'temporary' | 'failed'
export type MemorySource = 'hindsight' | 'local-fallback'

export interface Health {
  ok: boolean
  memory_mode: MemorySource
  memory_last_error?: string | null
  llm_mode: 'groq' | 'offline'
  model: string
  teams: Team[]
  decisions: number
  incidents: number
}

export interface Assumption { text: string; held: boolean | null; note?: string }
export interface Risk { raised_by: string; text: string; addressed: boolean | null; materialized: boolean | null }
export interface RiskFactor { label: string; points: number }
export interface RiskScore { score: number; level: RiskLevel; factors: RiskFactor[] }

export interface Decision {
  id: string
  team: Team
  title: string
  project?: string
  category: string
  owner: string
  services: string[]
  estimate_weeks: number | null
  actual_weeks: number | null
  status: 'open' | 'closed'
  proposed_at: string
  closed_at: string | null
  assumptions: Assumption[]
  risks: Risk[]
  outcome_summary?: string
  linked_incidents: string[]
  team_size?: number
  description?: string
  architecture?: string
  predicted_risk?: RiskScore
  ratio?: number | null
  progress?: { at: string; note: string }[]
}

export interface FixAttempt { action: string; result: FixResult; lasted_days?: number | null }
export interface TimelineEvent { at: string; event: string; kind: string }

export interface Incident {
  id: string
  team: Team
  date: string
  service: string
  title: string
  severity: Severity
  error_signature: string
  symptoms: string[]
  attempted_fixes: FixAttempt[]
  root_cause: string | null
  resolution: string | null
  linked_decision: string | null
  ttr_minutes: number | null
  status: 'open' | 'resolved'
  logs?: string[]
  timeline?: TimelineEvent[]
  similar_ids?: string[]
  similar_count?: number
  recurring?: boolean
  context?: Record<string, unknown> | null
  impacted_services?: string[]
}

export interface Memory {
  id?: string
  text: string
  type?: string
  document_id?: string
  tags?: string[]
  refs: string[]
  query?: string
  source?: MemorySource
  records?: { id: string; title: string; kind?: string; date?: string }[]
}

export interface Warning {
  type: 'estimate' | 'assumption' | 'ignored_warning' | 'incident_link' | 'insight'
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  evidence: string[]
  previously?: string
  why_now?: string
  confidence?: number
  credit?: string
}

export interface CorrectedEstimate {
  category: string
  raw_estimate_weeks: number
  factor: number
  corrected_weeks: number
  range_weeks: [number, number]
  based_on: string[]
  category_history: number
  team_factor: number
  confidence: string
}

export interface PremortemReport {
  mode: 'with_memory' | 'replay'
  proposal: { title: string; category: string; estimate_weeks: number | null; assumptions: string[]; services: string[] }
  summary: string
  verdict: 'go' | 'go-with-conditions' | 'rethink'
  checklist: string[]
  warnings: Warning[]
  corrected_estimate: CorrectedEstimate | null
  risk: RiskScore
  reflection: string | null
  evidence: Memory[]
  memory_stats: { strategies: number; recalled: number; used: number; memory_mode: MemorySource; llm_mode: string }
  first_time: boolean
}

export interface GenericReport {
  summary: string
  warnings: { title: string; detail: string; severity: string }[]
  checklist: string[]
}

export interface FixStat {
  action: string
  tried: number
  temporary: number
  failed: number
  resolved: number
  avg_lasted_days: number | null
  success_rate: number
  verdict: 'works' | 'temporary only' | 'does not work'
  events: { incident: string; date: string; result: FixResult; lasted_days?: number | null }[]
}

export interface Investigation {
  mode: string
  hypothesis: string
  summary?: string
  recommended_actions: { action: string; why: string; evidence?: string[] }[]
  avoid: { action: string; why: string; evidence?: string[] }[]
  similar_incidents: { id: string; title: string; date: string; service: string; root_cause: string; resolution: string; similarity: number }[]
  fix_decay: FixStat[]
  failed_fix_warnings: FixStat[]
  suspect_decisions: { id: string; title: string; reason: string; ignored_risks: string[] }[]
  evidence: Memory[]
  memory_stats: { recalled: number; memory_mode: MemorySource; llm_mode: string }
  conflicts?: MemoryConflict[]
}

export interface MemoryOp {
  seq: number
  at: string
  team: Team
  op: 'retain' | 'retain_batch' | 'recall' | 'reflect'
  source: MemorySource
  query?: string
  purpose?: string
  results?: number
  refs?: string[]
  document_id?: string
  document_ids?: string[]
  count?: number
  content?: string
  context?: string
  text?: string
  tags?: string[]
  latency_ms?: number
}

export interface Lesson {
  id: string
  kind: string
  lesson: string
  confidence: number
  history: { date: string; ref: string; event: string; detail: string; confidence: number }[]
}

export interface Overview {
  metrics: {
    decisions: number; open_decisions: number; incidents: number; resolved_incidents: number
    risks_identified: number; high_risk_decisions: number; recurring_patterns: number
    prediction_accuracy: number | null; team_accuracy: number | null
  }
  activity: { at: string; kind: 'decision' | 'shipped' | 'incident' | 'resolved'; ref: string; title: string; detail: string }[]
  risk_distribution: { level: RiskLevel; count: number }[]
  top_risks: ({ id: string; title: string } & RiskScore)[]
  decision_vs_actual: { id: string; title: string; estimate: number; actual: number }[]
  incident_trend: { quarter: string; SEV1: number; SEV2: number; SEV3: number; total: number }[]
  blind_spots: { lesson: string; kind: string; confidence: number; observations: number; refs: string[] }[]
  insights: MemoryOp[]
  memory_mode: MemorySource
}

export interface CurvePoint {
  id: string; date: string; title: string; category: string
  raw_error_pct: number; nexus_error_pct: number; raw_rolling: number; nexus_rolling: number; history_size: number
}

export interface GraveyardEntry {
  assumption: string; times_made: number; times_broke: number; break_rate: number
  decisions: string[]; evidence: { decision: string; title: string; note: string; date: string }[]
}

export interface TeamProfile {
  team: Team; decisions: number; overall_ratio: number
  worst_category: { category: string; mean_ratio: number } | null
  best_category: { category: string; mean_ratio: number } | null
  top_broken_assumption: GraveyardEntry | null
  ignored_warnings: number; ignored_that_materialized: number
  incidents: number; decision_caused_incidents: number; avg_ttr_minutes: number; temporary_fix_rate: number
  categories: { category: string; n: number; mean_ratio: number; min_ratio: number; max_ratio: number }[]
}

export interface AnalyticsBundle {
  estimate_vs_actual: { id: string; title: string; category: string; estimate: number; actual: number; ratio: number }[]
  accuracy_curve: CurvePoint[]
  recurrence: { service: string; incidents: number; recurring: number; rate: number }[]
  fix_outcomes: { result: FixResult; count: number }[]
  fix_stats: FixStat[]
  risk_distribution: { level: RiskLevel; count: number }[]
  risk_vs_overrun: { id: string; risk: number; ratio: number; title: string }[]
  assumptions: GraveyardEntry[]
  calibration: { overall_ratio: number; n: number; categories: TeamProfile['categories'] }
  teams: TeamProfile[]
}

export interface IgnoredWarnings {
  people: { name: string; raised: number; ignored: number; ignored_then_materialized: number; addressed: number; hit_rate_when_ignored: number | null }[]
  items: { decision: string; title: string; raised_by: string; risk: string; materialized: boolean; incidents: string[]; date: string }[]
}

export interface GraphNode { id: string; label: string; kind: string; [k: string]: unknown }
export interface GraphEdge { source: string; target: string; kind: string; why: string }

export interface ServiceRow {
  service: string; decisions: number; incidents: number; sev1: number; avg_overrun: number | null
  temporary_fix_rate: number | null; last_incident: string | null; decision_ids: string[]; incident_ids: string[]
}
export interface ProjectRow {
  project: string; decisions: number; open: number; estimate_weeks: number; actual_weeks: number; avg_ratio: number | null
  incidents: string[]; max_risk: number; services: string[]; owners: string[]; decision_ids: string[]
}

/* ------------------------------------------------------------------ organisational intelligence */
export interface DnaPattern {
  id: string; kind: string; status: 'pattern' | 'weak' | 'not_observed' | 'insufficient_data'
  title: string; supporting: number; n: number; frequency: number | null; confidence: number | null
  evidence: { id: string; title: string; date: string; detail: string }[]
  trend: { period: string; hits: number; n: number; rate: number }[]
  recommendation: string
  breakdown?: { assumption: string; broke: number; made: number }[]
}

export interface ConflictSide { label: string; action: string; result: string; ref: string; title: string; service: string; root_cause?: string | null }
export interface MemoryConflict {
  id: string; type: 'fix' | 'assumption'; subject: string; summary: string
  a: ConflictSide; b: ConflictSide
  others: { ref: string; result: string; action: string }[]
  context_differences: { field: string; a: unknown; b: unknown; differs: boolean; computed?: boolean }[]
  explanation: string | null; missing_context: string[]; recommendation: string
  counts: { resolved: number; failed: number; temporary: number }
  memories?: { text: string; refs: string[]; source?: string; type?: string }[]
  recall_error?: string
}

export interface PropNode {
  id: string; tier: string; runbook: boolean | null; catalogued: boolean; incidents: string[]; sev1: number
  decisions: string[]; decision_incidents: string[]; risk: number
}
export interface PropEdge { source: string; target: string; kind: 'declared' | 'observed' | 'inferred'; why: string; ref?: string; weight?: number }

export interface WhatIfEvidence {
  matched_terms: string[]; n: number; avg_ratio: number | null; incidents: string[]
  decisions: { id: string; title: string; ratio: number | null; incidents: string[]; status: string }[]
  broken_assumptions: { decision: string; assumption: string; note: string }[]
}
export interface WhatIfSide { advantages: string[]; disadvantages: string[]; risks: string[]; operational_complexity?: string }
export interface WhatIfResult {
  hypothetical: true; generated_by: string; original: string; alternative: string; memory_mode: MemorySource
  evidence: { original: WhatIfEvidence; alternative: WhatIfEvidence; shared: WhatIfEvidence['decisions'] }
  memories: { original: Memory[]; alternative: Memory[] }
  analysis: { original: WhatIfSide; alternative: WhatIfSide; final: { recommended: string; reasons: string[]; missing_information: string[]; confidence: string; tradeoffs?: string[] } }
}

export interface KnowledgeGap { kind: string; severity: 'high' | 'medium' | 'low'; title: string; detail: string; refs: string[]; action: string; action_kind: string }
export interface KnowledgeReport {
  metrics: { documentation_completeness: number | null; unresolved_gaps: number; incidents_without_root_cause: number; decisions_without_outcome: number; services_limited_knowledge: number; concentration_warnings: number }
  gaps: KnowledgeGap[]
  services: { service: string; incidents: number; documented_resolutions: number; runbook: boolean | null; decisions: number; contributors: number; tier: string | null }[]
}

export interface LearningEvent {
  ref: string; title: string; date: string; kind: string; live: boolean; net_change: number
  changes: { lesson: string; kind: string; before: number; after: number; event: string; detail: string }[]
}
export interface LearningReport {
  steps: { step: number; name: string; count: number; unit: string }[]
  events: LearningEvent[]; lessons: Lesson[]; memory_mode: MemorySource; note: string
}

export interface ScoreMetric {
  id: string; name: string; unit: string; value: number | null; explanation: string; lower_is_better?: boolean
  trend: { period: string; value: number; n: number }[]; records: string[]; records_label: string; completeness: number | null; detail?: string[]
}
