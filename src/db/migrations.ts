import type { Database } from 'sqlite';

export interface SchemaMigration {
  id: string;
  description: string;
  checksumSource: string;
  apply: (db: Database) => Promise<void>;
}

async function hasColumn(db: Database, tableName: string, columnName: string): Promise<boolean> {
  const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${tableName})`);
  return columns.some(column => column.name === columnName);
}

async function addColumnIfMissing(
  db: Database,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  if (await hasColumn(db, tableName, columnName)) return;
  await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

export const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    id: '001_core_schema_registry',
    description: 'Create and upgrade the schema migration registry.',
    checksumSource: '001:v1:schema_migrations_metadata_columns',
    apply: async () => undefined,
  },
  {
    id: '002_mission_canonical_index',
    description: 'Create Mission canonical index, event index, and evidence reference tables.',
    checksumSource: '002:v1:missions_index_mission_events_mission_evidence_refs',
    apply: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS missions_index (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          mode TEXT NOT NULL,
          query TEXT NOT NULL,
          source TEXT,
          depth TEXT,
          opportunityId TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          inputPayload TEXT NOT NULL,
          artifactPath TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_missions_index_updated
          ON missions_index (updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_missions_index_status_updated
          ON missions_index (status, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_missions_index_opportunity
          ON missions_index (opportunityId, updatedAt DESC);

        CREATE TABLE IF NOT EXISTS mission_events (
          id TEXT PRIMARY KEY,
          missionId TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT,
          phase TEXT,
          message TEXT NOT NULL,
          meta TEXT,
          artifactPath TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mission_events_lookup
          ON mission_events (missionId, timestamp ASC);

        CREATE TABLE IF NOT EXISTS mission_evidence_refs (
          id TEXT PRIMARY KEY,
          missionId TEXT NOT NULL,
          runId TEXT NOT NULL,
          capturedAt TEXT NOT NULL,
          status TEXT NOT NULL,
          completeness TEXT NOT NULL,
          artifactPath TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mission_evidence_refs_run
          ON mission_evidence_refs (runId);
        CREATE INDEX IF NOT EXISTS idx_mission_evidence_refs_mission
          ON mission_evidence_refs (missionId, capturedAt DESC);
      `);
    },
  },
  {
    id: '003_mission_run_lifecycle_columns',
    description: 'Add cancellation and failure code fields to mission runs.',
    checksumSource: '003:v1:mission_runs_cancelRequestedAt_failureCode',
    apply: async (db) => {
      await addColumnIfMissing(db, 'mission_runs', 'cancelRequestedAt', 'TEXT');
      await addColumnIfMissing(db, 'mission_runs', 'failureCode', 'TEXT');
    },
  },
  {
    id: '004_durable_stream_events',
    description: 'Create durable stream event log for replayable SSE streams.',
    checksumSource: '004:v1:stream_events_indexes',
    apply: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS stream_events (
          id TEXT PRIMARY KEY,
          stream TEXT NOT NULL,
          type TEXT NOT NULL,
          version INTEGER NOT NULL,
          entityId TEXT,
          occurredAt TEXT NOT NULL,
          payload TEXT NOT NULL,
          source TEXT NOT NULL,
          runId TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_stream_events_stream_time
          ON stream_events (stream, occurredAt ASC, id ASC);
        CREATE INDEX IF NOT EXISTS idx_stream_events_entity_time
          ON stream_events (entityId, occurredAt ASC, id ASC);
      `);
    },
  },
  {
    id: '005_task_runtime_columns',
    description: 'Add task runtime identity, payload, lease, heartbeat, and recovery columns.',
    checksumSource: '005:v1:tasks_runtime_payload_dedupe_lease_recovery_columns',
    apply: async (db) => {
      await addColumnIfMissing(db, 'tasks', 'missionId', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'runId', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'statePayload', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'inputPayload', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'dedupeKey', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'idempotencyKey', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'inputHash', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'leaseId', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'heartbeatAt', 'INTEGER');
      await addColumnIfMissing(db, 'tasks', 'cancelRequestedAt', 'INTEGER');
      await addColumnIfMissing(db, 'tasks', 'failureCode', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'degradedFlags', 'TEXT');
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_dedupe_status
        ON tasks (dedupeKey, status);
      `);
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_idempotency_status
        ON tasks (idempotencyKey, status);
      `);
    },
  },
  {
    id: '006_opportunity_profile_columns',
    description: 'Add typed Opportunity profile and catalyst calendar columns.',
    checksumSource: '006:v1:opportunities_heat_proxy_ipo_catalyst_calendar',
    apply: async (db) => {
      await addColumnIfMissing(db, 'opportunities', 'heatProfile', 'TEXT');
      await addColumnIfMissing(db, 'opportunities', 'proxyProfile', 'TEXT');
      await addColumnIfMissing(db, 'opportunities', 'ipoProfile', 'TEXT');
      await addColumnIfMissing(db, 'opportunities', 'catalystCalendar', "TEXT NOT NULL DEFAULT '[]'");
    },
  },
  {
    id: '007_narrative_lifecycle_columns',
    description: 'Add lifecycle tracking columns to legacy narratives.',
    checksumSource: '007:v1:narratives_lifecycle_columns',
    apply: async (db) => {
      await addColumnIfMissing(db, 'narratives', 'title', 'TEXT');
      await addColumnIfMissing(db, 'narratives', 'stage', "TEXT DEFAULT 'earlyFermentation'");
      await addColumnIfMissing(db, 'narratives', 'status', "TEXT DEFAULT 'active'");
      await addColumnIfMissing(db, 'narratives', 'impactScore', 'REAL DEFAULT 0');
      await addColumnIfMissing(db, 'narratives', 'coreTicker', 'TEXT');
      await addColumnIfMissing(db, 'narratives', 'lastUpdatedAt', 'INTEGER');
    },
  },
  {
    id: '008_mission_artifact_refs',
    description: 'Create Mission artifact reference table for indexed file artifacts.',
    checksumSource: '008:v2:mission_artifacts_kind_run_path_integrity_meta_indexes',
    apply: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS mission_artifacts (
          id TEXT PRIMARY KEY,
          missionId TEXT NOT NULL,
          runId TEXT,
          kind TEXT NOT NULL,
          artifactPath TEXT NOT NULL,
          sha256 TEXT,
          sizeBytes INTEGER,
          contentType TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          meta TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_mission_artifacts_mission_kind
          ON mission_artifacts (missionId, kind, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_mission_artifacts_run_kind
          ON mission_artifacts (runId, kind, updatedAt DESC);
      `);
    },
  },
  {
    id: '009_mission_canonical_table',
    description: 'Create canonical Mission table for queryable mission state.',
    checksumSource: '009:v1:missions_canonical_input_hash_artifact_integrity_indexes',
    apply: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS missions (
          id TEXT PRIMARY KEY,
          mode TEXT NOT NULL,
          query TEXT NOT NULL,
          tickers TEXT NOT NULL DEFAULT '[]',
          depth TEXT,
          source TEXT,
          opportunityId TEXT,
          status TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          inputPayload TEXT NOT NULL,
          inputHash TEXT NOT NULL,
          latestRunId TEXT,
          latestEventId TEXT,
          artifactPath TEXT,
          artifactSha256 TEXT,
          artifactSizeBytes INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_missions_updated
          ON missions (updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_missions_status_updated
          ON missions (status, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_missions_opportunity_updated
          ON missions (opportunityId, updatedAt DESC);
      `);
    },
  },
  {
    id: '010_opportunity_field_evidence',
    description: 'Create canonical Opportunity field evidence table for queryable provenance.',
    checksumSource: '010:v1:opportunity_field_evidence_status_event_refs_indexes',
    apply: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS opportunity_field_evidence (
          id TEXT PRIMARY KEY,
          opportunityId TEXT NOT NULL,
          field TEXT NOT NULL,
          label TEXT NOT NULL,
          kind TEXT NOT NULL,
          source TEXT NOT NULL,
          confidence TEXT NOT NULL,
          status TEXT NOT NULL,
          value TEXT,
          note TEXT,
          observedAt TEXT,
          recordedAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          createdEventId TEXT,
          invalidatedEventId TEXT,
          restoredEventId TEXT,
          meta TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_opportunity_field_evidence_lookup
          ON opportunity_field_evidence (opportunityId, status, field, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_opportunity_field_evidence_source
          ON opportunity_field_evidence (opportunityId, source, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_opportunity_field_evidence_event
          ON opportunity_field_evidence (createdEventId);
      `);
    },
  },
  {
    id: '011_opportunity_field_registry_overrides',
    description: 'Create editable Opportunity field registry overrides for provenance defaults.',
    checksumSource: '011:v1:opportunity_field_registry_overrides_defaults_audit',
    apply: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS opportunity_field_registry_overrides (
          field TEXT PRIMARY KEY,
          label TEXT,
          kind TEXT,
          source TEXT,
          confidence TEXT,
          note TEXT,
          updatedAt TEXT NOT NULL,
          updatedBy TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_opportunity_field_registry_overrides_updated
          ON opportunity_field_registry_overrides (updatedAt DESC);
      `);
    },
  },
  {
    id: '012_opportunity_field_registry_audit',
    description: 'Create audit history for editable Opportunity field registry overrides.',
    checksumSource: '012:v1:opportunity_field_registry_audit_history_snapshots',
    apply: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS opportunity_field_registry_audit (
          id TEXT PRIMARY KEY,
          field TEXT NOT NULL,
          action TEXT NOT NULL,
          changedFields TEXT NOT NULL,
          beforePayload TEXT,
          afterPayload TEXT,
          note TEXT,
          updatedAt TEXT NOT NULL,
          updatedBy TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_opportunity_field_registry_audit_field
          ON opportunity_field_registry_audit (field, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_opportunity_field_registry_audit_updated
          ON opportunity_field_registry_audit (updatedAt DESC);
      `);
    },
  },
];
