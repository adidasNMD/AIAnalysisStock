import type { Database } from 'sqlite';

// Baseline DDL copied from src/db/index.ts at git HEAD 1d78230974f8985fa1b3748ef09604fcaac8790a

export const description = 'Baseline: covers all tables from pre-migration era';

async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

async function addColumnIfMissing(db: Database, table: string, ddl: string, column: string): Promise<void> {
  if (await columnExists(db, table, column)) {
    return;
  }

  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
}

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      missionId TEXT,
      runId TEXT,
      query TEXT NOT NULL,
      depth TEXT NOT NULL,
      priority INTEGER NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      progress TEXT,
      statePayload TEXT,
      createdAt INTEGER NOT NULL,
      startedAt INTEGER,
      completedAt INTEGER,
      error TEXT
    );
  `);
  await addColumnIfMissing(db, 'tasks', 'missionId TEXT', 'missionId');
  await addColumnIfMissing(db, 'tasks', 'runId TEXT', 'runId');
  await addColumnIfMissing(db, 'tasks', 'statePayload TEXT', 'statePayload');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS mission_runs (
      id TEXT PRIMARY KEY,
      missionId TEXT NOT NULL,
      taskId TEXT,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      workerLeaseId TEXT,
      createdAt TEXT NOT NULL,
      startedAt TEXT,
      heartbeatAt TEXT,
      completedAt TEXT,
      failureMessage TEXT,
      degradedFlags TEXT
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mission_runs_mission_created
    ON mission_runs (missionId, createdAt DESC);
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mission_runs_task
    ON mission_runs (taskId);
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      query TEXT NOT NULL,
      thesis TEXT,
      summary TEXT,
      primaryTicker TEXT,
      leaderTicker TEXT,
      proxyTicker TEXT,
      relatedTickers TEXT NOT NULL,
      relayTickers TEXT NOT NULL,
      nextCatalystAt TEXT,
      supplyOverhang TEXT,
      policyStatus TEXT,
      scores TEXT NOT NULL,
      heatProfile TEXT,
      proxyProfile TEXT,
      ipoProfile TEXT,
      catalystCalendar TEXT NOT NULL DEFAULT '[]',
      latestMissionId TEXT,
      latestEventType TEXT,
      latestEventMessage TEXT,
      latestEventAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunities_type_updated
    ON opportunities (type, updatedAt DESC);
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunities_status_updated
    ON opportunities (status, updatedAt DESC);
  `);
  await addColumnIfMissing(db, 'opportunities', 'heatProfile TEXT', 'heatProfile');
  await addColumnIfMissing(db, 'opportunities', 'proxyProfile TEXT', 'proxyProfile');
  await addColumnIfMissing(db, 'opportunities', 'ipoProfile TEXT', 'ipoProfile');
  await addColumnIfMissing(db, 'opportunities', `catalystCalendar TEXT NOT NULL DEFAULT '[]'`, 'catalystCalendar');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_snapshots (
      id TEXT PRIMARY KEY,
      opportunityId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunity_snapshots_lookup
    ON opportunity_snapshots (opportunityId, createdAt DESC);
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_events (
      id TEXT PRIMARY KEY,
      opportunityId TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      meta TEXT
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunity_events_lookup
    ON opportunity_events (opportunityId, timestamp DESC);
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS narratives (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      meta TEXT
    );
  `);
  await addColumnIfMissing(db, 'narratives', 'title TEXT', 'title');
  await addColumnIfMissing(db, 'narratives', `stage TEXT DEFAULT 'earlyFermentation'`, 'stage');
  await addColumnIfMissing(db, 'narratives', `status TEXT DEFAULT 'active'`, 'status');
  await addColumnIfMissing(db, 'narratives', 'impactScore REAL DEFAULT 0', 'impactScore');
  await addColumnIfMissing(db, 'narratives', 'coreTicker TEXT', 'coreTicker');
  await addColumnIfMissing(db, 'narratives', 'lastUpdatedAt INTEGER', 'lastUpdatedAt');
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP TABLE IF EXISTS narratives;');
  await db.exec('DROP TABLE IF EXISTS opportunity_events;');
  await db.exec('DROP TABLE IF EXISTS opportunity_snapshots;');
  await db.exec('DROP TABLE IF EXISTS opportunities;');
  await db.exec('DROP TABLE IF EXISTS mission_runs;');
  await db.exec('DROP TABLE IF EXISTS tasks;');
}
