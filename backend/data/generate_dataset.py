"""
Generates the synthetic engineering history NEXUS is seeded with.

The data is fictional but deliberately patterned so the memory layer has
something real to learn:

Payments team
  * migrations / infra work runs ~2.3x over estimate, frontend ~1.2x
  * "no schema changes needed" and "vendor API is stable" keep breaking
  * Priya Raman repeatedly flags rollback risk; it is ignored and later bites
  * DB connection-pool incidents: restarts only buy a few days, pool tuning fixes it

Platform team (different blind spot)
  * migrations are well estimated (~1.3x) but security / compliance work runs ~2.5x
  * "teams will adopt it voluntarily" fails every time

Run:  python data/generate_dataset.py   -> writes decisions.json and incidents.json
"""
import json
from pathlib import Path

HERE = Path(__file__).parent

# (id, team, proposed, closed, title, category, owner, services, est_weeks, actual_weeks,
#  assumptions[(text, held, note)], risks[(raised_by, text, addressed, materialized)],
#  outcome, linked_incidents)
D = [
    # ------------------------------ PAYMENTS ------------------------------
    ("D-0101", "payments", "2025-01-13", "2025-03-21", "Migrate ledger-service from MySQL 5.7 to PostgreSQL 15",
     "migration", "Rohan Mehta", ["ledger-service"], 3, 7,
     [("No schema changes needed; ORM abstracts the dialect", False, "JSON columns and ENUMs needed rewrites; 41 migrations hand-edited"),
      ("Dual-write window of one week is enough", False, "Reconciliation found drift for 19 days")],
     [("Priya Raman", "No tested rollback path if dual-writes diverge", False, True)],
     "Shipped 4 weeks late. Divergence during dual-write caused a 2-hour ledger freeze.", ["INC-0201"]),
    ("D-0102", "payments", "2025-02-03", "2025-02-28", "Redesign checkout payment-method picker",
     "frontend", "Sneha Kulkarni", ["checkout-web"], 3, 3.5,
     [("Design system has the needed components", True, "")],
     [("Arjun Nair", "Accessibility review needed for card input", True, False)],
     "Shipped on time-ish; conversion +1.8% in A/B test.", []),
    ("D-0103", "payments", "2025-02-17", "2025-05-02", "Move refund-worker from cron to SQS consumers",
     "infra", "Karthik Subramanian", ["refund-worker"], 4, 9,
     [("Refund jobs are idempotent", False, "Duplicate refunds issued for retried messages"),
      ("Existing IAM roles cover SQS access", True, "")],
     [("Priya Raman", "Need a rollback switch back to cron during cutover", False, True),
      ("Arjun Nair", "Message retries could double-refund", True, True)],
     "5 weeks over. 37 duplicate refunds (INR 4.1L) before an idempotency key was added.", ["INC-0202"]),
    ("D-0104", "payments", "2025-03-10", "2025-04-18", "Integrate Razorpay as secondary acquirer",
     "feature", "Arjun Nair", ["payment-gateway"], 4, 5.5,
     [("Vendor API is stable and matches the docs", False, "Webhook payload format changed mid-integration"),
      ("Sandbox behaves like production", False, "Production 3DS flow differed")],
     [("Rohan Mehta", "Vendor webhooks may arrive out of order", True, False)],
     "1.5 weeks over, driven by undocumented vendor behaviour.", []),
    ("D-0105", "payments", "2025-04-07", "2025-05-09", "Add saved-cards management page",
     "frontend", "Sneha Kulkarni", ["checkout-web"], 4, 4.5,
     [("Tokenisation API supports listing cards", True, "")], [],
     "Shipped close to plan.", []),
    ("D-0106", "payments", "2025-05-05", "2025-07-25", "Split payment-gateway monolith: extract fraud-scorer",
     "migration", "Rohan Mehta", ["payment-gateway", "fraud-scorer"], 5, 12,
     [("No schema changes needed; fraud tables are self-contained", False, "Shared FK constraints with orders table"),
      ("p99 latency stays under 120ms after network hop", False, "p99 went to 340ms; needed gRPC + caching")],
     [("Priya Raman", "No rollback plan if extracted service misbehaves under peak load", False, True),
      ("Karthik Subramanian", "Connection pool sizing for new service not load-tested", False, True)],
     "7 weeks over. Peak-hour pool exhaustion caused the July checkout outage.", ["INC-0204", "INC-0205"]),
    ("D-0107", "payments", "2025-06-02", "2025-06-27", "UPI intent flow for mobile web",
     "feature", "Arjun Nair", ["checkout-web", "payment-gateway"], 3, 4,
     [("Vendor API is stable and matches the docs", False, "NPCI callback timing changed in sandbox v2")],
     [], "1 week over due to vendor sandbox changes.", []),
    ("D-0108", "payments", "2025-07-14", "2025-09-26", "Upgrade Kubernetes node pools for payments namespace to 1.29",
     "infra", "Karthik Subramanian", ["payment-gateway", "ledger-service"], 3, 6.5,
     [("Helm charts are compatible with the new API versions", False, "PodSecurityPolicy removal broke 6 charts")],
     [("Priya Raman", "Need blue/green node pools so we can roll back", True, False)],
     "3.5 weeks over, but no customer impact thanks to blue/green pools.", []),
    ("D-0109", "payments", "2025-08-04", "2025-09-05", "Revamp payment failure messaging and retry CTA",
     "frontend", "Sneha Kulkarni", ["checkout-web"], 3, 3.5,
     [("Error codes from gateway are consistent", True, "")], [], "Retry success +6%.", []),
    ("D-0110", "payments", "2025-09-01", "2025-11-21", "Event-source ledger with Debezium CDC",
     "data", "Rohan Mehta", ["ledger-service"], 6, 10,
     [("No schema changes needed for CDC", False, "Needed replica identity + primary keys on 9 tables"),
      ("Downstream consumers can handle at-least-once", True, "")],
     [("Priya Raman", "Rollback if CDC lags during month-end close", False, True)],
     "4 weeks over. CDC lag during month-end close delayed reports by 6 hours.", ["INC-0207"]),
    ("D-0111", "payments", "2025-10-06", "2025-11-07", "Add multi-currency display on invoices",
     "feature", "Arjun Nair", ["notification-service"], 3, 4.5,
     [("FX rates service has needed precision", False, "Needed 6dp rates; service had 4dp")], [],
     "1.5 weeks over.", []),
    ("D-0112", "payments", "2025-11-03", "2026-01-30", "Migrate payment-gateway queue from RabbitMQ to Kafka (phase 1: refunds)",
     "migration", "Karthik Subramanian", ["refund-worker", "payment-gateway"], 4, 9,
     [("No schema changes needed; reuse JSON messages as-is", False, "Needed Avro schemas + registry for consumers"),
      ("Consumer lag will stay under 1 minute", False, "Lag hit 25 min during sale events"),
      ("Ordering per merchant is preserved by default", False, "Partition key had to change")],
     [("Priya Raman", "No rollback to RabbitMQ once producers are switched", False, True)],
     "5 weeks over. Refund backlog during the December sale.", ["INC-0209"]),
    ("D-0113", "payments", "2026-01-12", "2026-02-13", "Checkout page performance budget (LCP < 2.0s)",
     "frontend", "Sneha Kulkarni", ["checkout-web"], 4, 4.5,
     [("Third-party scripts can be deferred", True, "")], [], "LCP 2.6s -> 1.8s.", []),
    ("D-0114", "payments", "2026-02-09", "2026-04-17", "Introduce PgBouncer in front of ledger-service",
     "infra", "Karthik Subramanian", ["ledger-service"], 3, 6,
     [("Application does not rely on session-level state", False, "Prepared statements broke in transaction mode")],
     [("Priya Raman", "Keep direct-connection fallback flag for rollback", True, False)],
     "3 weeks over, no incident because the fallback flag existed.", []),
    ("D-0115", "payments", "2026-03-02", "2026-04-03", "Chargeback evidence upload flow",
     "feature", "Arjun Nair", ["payment-gateway"], 4, 5,
     [("Vendor API is stable and matches the docs", True, "")], [], "1 week over.", []),
    ("D-0116", "payments", "2026-05-04", "2026-07-31", "Migrate fraud-scorer features to a feature store",
     "migration", "Rohan Mehta", ["fraud-scorer"], 5, 11,
     [("No schema changes needed; features map 1:1", False, "Point-in-time joins required new timestamp columns"),
      ("Online store latency under 10ms", True, "")],
     [("Priya Raman", "Shadow-mode comparison before switching scores", True, False)],
     "6 weeks over; shadow mode caught a scoring regression before launch.", []),
    ("D-0117", "payments", "2026-06-08", "2026-07-10", "Merchant dashboard: settlement timeline widget",
     "frontend", "Sneha Kulkarni", ["merchant-dashboard"], 3, 3.5,
     [("Settlement API exposes per-batch status", True, "")], [], "On time.", []),
    ("D-0118", "payments", "2026-07-06", "2026-09-25", "Move notification-service to managed Redis (ElastiCache)",
     "infra", "Karthik Subramanian", ["notification-service"], 3, 7,
     [("Key eviction policy is the same", False, "Default allkeys-lru evicted dedupe keys -> duplicate SMS")],
     [("Priya Raman", "No rollback path to self-hosted Redis during cutover", False, True)],
     "4 weeks over; 12k duplicate SMS during cutover.", ["INC-0213"]),
    # ------------------------------ PLATFORM ------------------------------
    ("D-0301", "platform", "2025-01-20", "2025-03-07", "Migrate CI from Jenkins to GitHub Actions self-hosted runners",
     "migration", "Vikram Desai", ["ci-runners"], 5, 6.5,
     [("All pipelines can be converted with the importer", True, ""),
      ("Teams will adopt the new pipelines voluntarily", False, "Only 4/17 teams moved until Jenkins was frozen")],
     [("Meera Joshi", "Runner autoscaling cost may spike", True, False)],
     "1.5 weeks over; adoption needed a hard Jenkins freeze date.", []),
    ("D-0302", "platform", "2025-03-03", "2025-06-13", "SOC 2 Type II evidence automation",
     "security", "Farah Khan", ["secrets-vault", "observability-stack"], 4, 10,
     [("Existing logs cover access-review evidence", False, "Needed 90-day retention + new audit trails")],
     [("Aditya Rao", "Auditor sampling may need manual exports", False, True)],
     "6 weeks over; auditor requested manual exports anyway.", []),
    ("D-0309", "platform", "2025-04-14", "2025-05-30", "Upgrade service-mesh to Istio 1.22",
     "migration", "Aditya Rao", ["service-mesh"], 4, 5,
     [("Sidecar injection works for all namespaces", True, "")],
     [("Meera Joshi", "Canary namespace first", True, False)], "1 week over.", []),
    ("D-0303", "platform", "2025-06-09", "2025-08-01", "Internal developer portal (Backstage)",
     "developer-experience", "Meera Joshi", ["dev-portal"], 5, 8,
     [("Teams will adopt the portal voluntarily", False, "Catalog stayed 30% complete until made mandatory for deploys")],
     [], "3 weeks over; adoption only after deploy gating.", []),
    ("D-0304", "platform", "2025-08-18", "2025-11-14", "Rotate all service secrets into Vault with dynamic DB creds",
     "security", "Farah Khan", ["secrets-vault"], 5, 12,
     [("Services can reload credentials without restart", False, "11 services cached creds at boot"),
      ("Teams will adopt the Vault sidecar voluntarily", False, "Needed a platform-run migration sprint")],
     [("Nikhil Bansal", "Credential TTL expiry could cause outages", False, True)],
     "7 weeks over; one outage from expired DB creds.", ["INC-0302"]),
    ("D-0305", "platform", "2025-10-06", "2025-11-21", "Consolidate logging from ELK to Grafana Loki",
     "migration", "Aditya Rao", ["observability-stack"], 5, 6.5,
     [("Query patterns translate to LogQL", True, "")],
     [("Meera Joshi", "Keep ELK read-only for 30 days for rollback", True, False)], "1.5 weeks over.", []),
    ("D-0306", "platform", "2026-01-05", "2026-04-10", "PCI-DSS 4.0 network segmentation for cardholder environment",
     "security", "Farah Khan", ["k8s-cluster", "service-mesh"], 6, 14,
     [("Network policies can be applied without app changes", False, "6 services needed egress rewrites"),
      ("Teams will adopt the new ingress pattern voluntarily", False, "Required enforcement in admission controller")],
     [("Nikhil Bansal", "Strict policies might block health checks", False, True)],
     "8 weeks over; health-check blocking caused a 40-minute partial outage.", ["INC-0304"]),
    ("D-0307", "platform", "2026-03-09", "2026-04-24", "Upgrade EKS control plane 1.28 -> 1.30",
     "infra", "Vikram Desai", ["k8s-cluster"], 4, 5,
     [("Add-ons have compatible versions", True, "")],
     [("Meera Joshi", "Upgrade staging cluster a week earlier", True, False)], "1 week over.", []),
    ("D-0119", "payments", "2026-10-05", None, "Shard ledger-service Postgres by merchant_id",
     "migration", "Rohan Mehta", ["ledger-service", "postgres-ledger"], 6, None,
     [("No schema changes needed; Citus handles distribution", None, ""),
      ("Cross-shard reports can be served from the replica", None, "")],
     [("Priya Raman", "No rollback path once writes are distributed", None, None)], "", []),
    ("D-0120", "payments", "2026-08-10", "2026-09-04", "Adopt OpenTelemetry tracing in checkout",
     "infra", "Arjun Nair", ["checkout-web", "payment-gateway"], 2, 2.5, [], [], "", []),
    ("D-0310", "platform", "2026-10-12", None, "Move CI runners to ARM (Graviton) instances",
     "infra", "Vikram Desai", ["ci-runners"], 3, None,
     [("All build images already publish arm64 variants", None, "")], [], "", []),
    ("D-0308", "platform", "2026-06-01", "2026-08-28", "SSO + SCIM for all internal tools",
     "security", "Farah Khan", ["dev-portal", "secrets-vault"], 4, 9,
     [("All tools support SCIM provisioning", False, "3 tools needed custom connectors")],
     [("Aditya Rao", "Break-glass admin accounts needed", True, False)], "5 weeks over.", []),
]

# Incidents: (id, team, date, service, title, error_signature, symptoms, attempted_fixes[(action, result, lasted_days)],
#             root_cause, resolution, linked_decision, ttr_minutes)
I = [
    ("INC-0201", "payments", "2025-03-04", "ledger-service", "Ledger writes frozen during dual-write divergence",
     "ERROR ledger.reconcile: balance mismatch account=... delta=...", ["ledger writes rejected", "reconciliation alarms"],
     [("Restart ledger-service pods", "failed", 0), ("Pause dual-write and replay from MySQL binlog", "resolved", None)],
     "Dual-write path had no ordering guarantee; no tested rollback", "Paused dual-write, replayed binlog, added reconciliation gate", "D-0101", 128),
    ("INC-0202", "payments", "2025-04-11", "refund-worker", "Duplicate refunds after SQS redelivery",
     "WARN refund.process: message redelivered receiveCount=3", ["duplicate refunds", "merchant complaints"],
     [("Increase SQS visibility timeout", "temporary", 4), ("Add idempotency key on refund_id", "resolved", None)],
     "Non-idempotent consumer + redelivery", "Idempotency key on refund_id", "D-0103", 340),
    ("INC-0203", "payments", "2025-05-22", "payment-gateway", "DB connection timeouts on payment-gateway",
     "HikariPool-1 - Connection is not available, request timed out after 30000ms", ["p99 latency 4s", "payment failures 12%"],
     [("Restart payment-gateway pods", "temporary", 3), ("Increase max pool size 20 -> 80", "failed", 0),
      ("Move fraud queries to read replica", "resolved", None)],
     "Pool exhaustion from long-running fraud queries holding connections", "Moved fraud queries to read replica", None, 96),
    ("INC-0204", "payments", "2025-07-08", "payment-gateway", "Checkout outage at peak: connection pool exhausted",
     "HikariPool-1 - Connection is not available, request timed out after 30000ms", ["checkout 5xx 31%", "DB connections at max"],
     [("Restart payment-gateway pods", "temporary", 2), ("Scale out gateway replicas 6 -> 12", "failed", 0),
      ("Reduce per-pod pool size 50 -> 15 and add PgBouncer", "resolved", None)],
     "More replicas x large per-pod pools exceeded Postgres max_connections after fraud-scorer extraction", "Smaller per-pod pools + PgBouncer", "D-0106", 74),
    ("INC-0205", "payments", "2025-07-19", "fraud-scorer", "fraud-scorer timeouts cascade into checkout",
     "DeadlineExceeded: fraud-scorer /score 800ms", ["checkout latency spike", "fallback scoring engaged"],
     [("Restart fraud-scorer", "temporary", 1), ("Add circuit breaker + cached score fallback", "resolved", None)],
     "Synchronous dependency with no breaker", "Circuit breaker with cached fallback", "D-0106", 52),
    ("INC-0206", "payments", "2025-08-27", "payment-gateway", "Connection timeouts during flash sale",
     "HikariPool-1 - Connection is not available, request timed out after 30000ms", ["payment failures 8%"],
     [("Restart payment-gateway pods", "temporary", 5), ("Increase max pool size", "failed", 0),
      ("Kill long transactions >30s and add statement_timeout", "resolved", None)],
     "Long-running transactions holding pool connections", "statement_timeout=5s, idle_in_transaction timeout", None, 61),
    ("INC-0207", "payments", "2025-11-30", "ledger-service", "CDC lag delays month-end settlement reports",
     "Debezium connector lag 21600s", ["reports delayed 6h"],
     [("Restart Debezium connector", "temporary", 1), ("Increase connector tasks and snapshot.fetch.size", "resolved", None)],
     "Single-task connector during month-end write burst", "Parallel tasks + heartbeat tuning", "D-0110", 390),
    ("INC-0208", "payments", "2026-01-09", "payment-gateway", "Payment API latency + DB timeouts after deploy",
     "HikariPool-1 - Connection is not available, request timed out after 30000ms", ["p99 2.8s", "timeouts"],
     [("Restart payment-gateway pods", "temporary", 2), ("Reduce per-pod pool size and route via PgBouncer", "resolved", None)],
     "New deploy reset pool size to default 50", "Pinned pool size in config; PgBouncer", None, 45),
    ("INC-0209", "payments", "2025-12-14", "refund-worker", "Refund backlog: Kafka consumer lag 25 minutes",
     "kafka consumer group refund-v2 lag=148213", ["refunds delayed", "support tickets spike"],
     [("Restart consumers", "temporary", 0), ("Add partitions 6 -> 24 and rebalance", "resolved", None)],
     "Partition count too low for sale traffic; no rollback to RabbitMQ", "More partitions, autoscaling consumers", "D-0112", 210),
    ("INC-0213", "payments", "2026-08-21", "notification-service", "Duplicate SMS after Redis migration",
     "dedupe key missing for notification_id", ["customers received 2-4 SMS"],
     [("Flush Redis cache", "failed", 0), ("Set maxmemory-policy volatile-lru and TTL on dedupe keys", "resolved", None)],
     "allkeys-lru evicted dedupe keys", "volatile-lru + separate dedupe cluster", "D-0118", 150),
    ("INC-0210", "payments", "2025-10-14", "ledger-service", "Ledger API request queueing: connection pool too small",
     "HikariPool-2 - Connection is not available, request timed out after 30000ms", ["p99 1.9s", "ledger writes queueing"],
     [("Restart ledger-service pods", "temporary", 1), ("Increase max pool size 10 -> 40", "resolved", None)],
     "Pool of 10 per pod far below concurrent request load; database had ample headroom (60 of 400 connections in use)",
     "Raised pool to 40 per pod", None, 38),
    ("INC-0215", "payments", "2026-09-30", "settlement-reports", "Month-end settlement report job timed out",
     "Job settlement_daily exceeded 3600s timeout", ["finance reports missing at 09:00"],
     [("Re-run job manually", "temporary", 3)], None, None, None, 240),
    ("INC-0302", "platform", "2025-10-21", "secrets-vault", "Orders DB auth failures after credential TTL expiry",
     "FATAL: password authentication failed for user v-orders-...", ["orders API 500s"],
     [("Restart affected services", "temporary", 1), ("Implement credential renewal hook + longer TTL", "resolved", None)],
     "Services cached dynamic creds at boot", "Renewal sidecar", "D-0304", 88),
    ("INC-0303", "platform", "2026-02-03", "ci-runners", "CI runner queue saturation",
     "Waiting for a runner to pick up this job... (45m)", ["builds queued 45min"],
     [("Manually add runners", "temporary", 2), ("Fix autoscaler min-idle + spot fallback", "resolved", None)],
     "Spot capacity shortage, no on-demand fallback", "Mixed instances policy", None, 120),
    ("INC-0304", "platform", "2026-03-18", "k8s-cluster", "Health checks blocked by new network policies",
     "Readiness probe failed: connection refused", ["pods flapping", "partial outage 40m"],
     [("Restart pods", "failed", 0), ("Allow kubelet CIDR in NetworkPolicy", "resolved", None)],
     "Default-deny policy blocked kubelet probes", "Policy exception for probes", "D-0306", 40),
    ("INC-0305", "platform", "2026-07-22", "observability-stack", "Loki ingesters dropping logs under load",
     "level=warn msg=\"push request failed\" err=\"rate limit exceeded\"", ["missing logs for 2 hours"],
     [("Restart ingesters", "temporary", 4)], None, None, None, 95),
]


# Extra attributes kept separate so the tuples above stay readable.
PROJECT = {
    "D-0101": "Ledger modernisation", "D-0110": "Ledger modernisation", "D-0114": "Ledger modernisation",
    "D-0102": "Checkout experience", "D-0105": "Checkout experience", "D-0109": "Checkout experience",
    "D-0113": "Checkout experience", "D-0117": "Merchant dashboard",
    "D-0103": "Event-driven payments", "D-0112": "Event-driven payments", "D-0118": "Event-driven payments",
    "D-0104": "Acquirer integrations", "D-0107": "Acquirer integrations", "D-0111": "Acquirer integrations",
    "D-0115": "Acquirer integrations",
    "D-0106": "Fraud platform", "D-0116": "Fraud platform", "D-0108": "Payments infrastructure",
    "D-0301": "Developer platform", "D-0303": "Developer platform",
    "D-0302": "Compliance programme", "D-0304": "Compliance programme", "D-0306": "Compliance programme",
    "D-0308": "Compliance programme",
    "D-0309": "Cluster operations", "D-0305": "Cluster operations", "D-0307": "Cluster operations",
    "D-0119": "Ledger modernisation", "D-0120": "Checkout experience", "D-0310": "Developer platform",
}
TEAM_SIZE = {"migration": 4, "infra": 3, "feature": 3, "frontend": 2, "data": 4, "security": 4, "developer-experience": 3}
SEVERITY = {"INC-0201": "SEV1", "INC-0202": "SEV2", "INC-0203": "SEV2", "INC-0204": "SEV1", "INC-0205": "SEV2",
            "INC-0206": "SEV2", "INC-0207": "SEV3", "INC-0208": "SEV2", "INC-0209": "SEV2", "INC-0213": "SEV3",
            "INC-0302": "SEV1", "INC-0303": "SEV3", "INC-0304": "SEV1", "INC-0210": "SEV2", "INC-0215": "SEV3",
            "INC-0305": "SEV3"}

# Operating context recorded during the incident. Only connection-pool incidents have it, which is
# exactly what the Memory Conflict Detector needs to explain why the same fix worked once and failed twice.
CONTEXT = {
    "INC-0203": {"replicas": 6, "pool_per_pod": 20, "db_max_connections": 200, "pgbouncer": False,
                 "workload": "long-running fraud queries holding connections", "architecture": "monolith + read replica"},
    "INC-0204": {"replicas": 12, "pool_per_pod": 50, "db_max_connections": 500, "pgbouncer": False,
                 "workload": "peak checkout traffic", "architecture": "gateway + extracted fraud-scorer"},
    "INC-0206": {"replicas": 8, "pool_per_pod": 50, "db_max_connections": 500, "pgbouncer": False,
                 "workload": "flash sale with long transactions", "architecture": "gateway + extracted fraud-scorer"},
    "INC-0208": {"replicas": 10, "pool_per_pod": 50, "db_max_connections": 500, "pgbouncer": False,
                 "workload": "normal traffic after deploy", "architecture": "gateway + extracted fraud-scorer"},
    "INC-0210": {"replicas": 3, "pool_per_pod": 10, "db_max_connections": 400, "pgbouncer": False,
                 "workload": "short OLTP queries, high concurrency", "architecture": "ledger-service, single primary"},
}
# Services observed to be affected by an incident (from the incident record, not inferred).
IMPACTED = {"INC-0201": ["merchant-dashboard", "settlement-reports"], "INC-0204": ["checkout-web"],
            "INC-0205": ["payment-gateway", "checkout-web"], "INC-0207": ["settlement-reports"],
            "INC-0209": ["payment-gateway"], "INC-0302": ["dev-portal"], "INC-0304": ["service-mesh"]}

# Service catalogue: declared dependencies (depends_on), tier and whether a runbook exists.
SERVICES = [
    ("payments", "checkout-web", "critical", True, ["payment-gateway"]),
    ("payments", "payment-gateway", "critical", True, ["fraud-scorer", "ledger-service", "postgres-payments"]),
    ("payments", "fraud-scorer", "critical", False, ["postgres-payments", "feature-store"]),
    ("payments", "ledger-service", "critical", False, ["postgres-ledger"]),
    ("payments", "refund-worker", "standard", False, ["payment-gateway", "ledger-service", "kafka-cluster"]),
    ("payments", "notification-service", "standard", False, ["redis-notifications", "payment-gateway"]),
    ("payments", "merchant-dashboard", "standard", True, ["ledger-service"]),
    ("payments", "settlement-reports", "standard", False, ["ledger-service", "postgres-ledger"]),
    ("payments", "postgres-payments", "critical", True, []),
    ("payments", "postgres-ledger", "critical", False, []),
    ("payments", "kafka-cluster", "critical", False, []),
    ("payments", "redis-notifications", "standard", False, []),
    ("payments", "feature-store", "standard", False, []),
    ("platform", "k8s-cluster", "critical", True, []),
    ("platform", "service-mesh", "critical", False, ["k8s-cluster"]),
    ("platform", "ci-runners", "standard", True, ["k8s-cluster"]),
    ("platform", "secrets-vault", "critical", False, ["k8s-cluster"]),
    ("platform", "observability-stack", "standard", False, ["k8s-cluster"]),
    ("platform", "dev-portal", "standard", True, ["ci-runners", "secrets-vault"]),
]


def _logs(iid, date, svc, sig, fixes):
    """Plausible log excerpt + incident timeline derived from the fix history."""
    h, m = 14, 2
    logs = [f"{date}T{h:02d}:{m:02d}:11Z {svc} WARN  latency p99 above SLO threshold",
            f"{date}T{h:02d}:{m + 1:02d}:47Z {svc} ERROR {sig}",
            f"{date}T{h:02d}:{m + 1:02d}:48Z {svc} ERROR {sig}",
            f"{date}T{h:02d}:{m + 2:02d}:05Z alertmanager FIRING {svc}-error-rate"]
    timeline = [{"at": f"{date}T{h:02d}:{m:02d}:00Z", "event": "Alert fired", "kind": "detected"}]
    t = m + 6
    for f in fixes:
        timeline.append({"at": f"{date}T{h + t // 60:02d}:{t % 60:02d}:00Z", "event": f[0],
                         "kind": "fix-" + f[1]})
        t += 17
    timeline.append({"at": f"{date}T{h + t // 60:02d}:{t % 60:02d}:00Z", "event": "Incident resolved", "kind": "resolved"})
    return logs, timeline


def build():
    decisions = []
    for (did, team, proposed, closed, title, cat, owner, services, est, actual, assumptions, risks, outcome, incs) in D:
        decisions.append({
            "id": did, "team": team, "proposed_at": proposed, "closed_at": closed, "title": title,
            "category": cat, "owner": owner, "services": services,
            "project": PROJECT.get(did, "General"), "team_size": TEAM_SIZE.get(cat, 3),
            "estimate_weeks": est, "actual_weeks": actual, "status": "closed" if closed else "open",
            "assumptions": [{"text": t, "held": h, "note": n} for t, h, n in assumptions],
            "risks": [{"raised_by": b, "text": t, "addressed": a, "materialized": m} for b, t, a, m in risks],
            "progress": [],
            "outcome_summary": outcome, "linked_incidents": incs,
        })
    incidents = []
    for (iid, team, date, svc, title, sig, symptoms, fixes, rc, res, link, ttr) in I:
        logs, timeline = _logs(iid, date, svc, sig, fixes)
        incidents.append({
            "severity": SEVERITY.get(iid, "SEV3"), "logs": logs, "timeline": timeline,
            "id": iid, "team": team, "date": date, "service": svc, "title": title, "error_signature": sig,
            "symptoms": symptoms,
            "attempted_fixes": [{"action": a, "result": r, "lasted_days": l} for a, r, l in fixes],
            "root_cause": rc, "resolution": res, "linked_decision": link, "ttr_minutes": ttr, "status": "resolved",
            "context": CONTEXT.get(iid), "impacted_services": IMPACTED.get(iid, []),
        })
    services = [{"name": n, "team": t, "tier": tier, "runbook": rb, "depends_on": deps} for t, n, tier, rb, deps in SERVICES]
    (HERE / "services.json").write_text(json.dumps(services, indent=2))
    (HERE / "decisions.json").write_text(json.dumps(decisions, indent=2))
    (HERE / "incidents.json").write_text(json.dumps(incidents, indent=2))
    print(f"wrote {len(decisions)} decisions, {len(incidents)} incidents")


if __name__ == "__main__":
    build()
