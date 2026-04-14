import { getDb } from '../db';
import { logger } from './logger';
import type { AnalysisDepth } from '../models/handoff';

export interface QueueTask {
  id: string;
  missionId?: string;
  runId?: string;
  query: string;
  depth: AnalysisDepth;
  priority: number;        
  source: string;          
  status: 'pending' | 'running' | 'done' | 'failed' | 'canceled';
  progress?: 'scout' | 'analyst' | 'strategist' | 'council' | 'synthesis';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  statePayload?: string;
}

export interface RecoverResult {
  totalRecovered: number;
  recoveredRunningTaskIds: string[];
}

const MAX_TASK_AGE_MS = 2 * 60 * 60 * 1000; 

export class TaskQueue {
  private concurrency: number;
  private runningCount = 0;
  private processCallback: ((task: QueueTask) => Promise<void>) | null = null;

  constructor() {
    this.concurrency = Number(process.env.TASK_QUEUE_CONCURRENCY) || 3;
  }

  onProcess(callback: (task: QueueTask) => Promise<void>) {
    this.processCallback = callback;
  }

  async enqueue(query: string, depth: AnalysisDepth, source: string, priority = 0, missionId?: string): Promise<QueueTask | null> {
    const db = await getDb();
    
    const existing = await db.get(
      'SELECT id, missionId, status FROM tasks WHERE query = ? AND status IN (?, ?)',
      query, 'pending', 'running'
    );
    if (existing) {
      const missionNote = existing.missionId ? ` mission=${existing.missionId}` : '';
      logger.info(`[TaskQueue] ⏭️ 跳过重复任务: "${query}" (已存在 ${existing.status} 任务 ${existing.id}${missionNote})`);
      return null;
    }

    const task: QueueTask = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      query,
      depth,
      priority,
      source,
      status: 'pending',
      createdAt: Date.now(),
    };
    if (missionId) {
      task.missionId = missionId;
    }

    await this.saveTask(task);
    const missionNote = missionId ? ` mission=${missionId}` : '';
    logger.info(`[TaskQueue] 📥 入队: "${query}" [${depth}] 来源=${source} 优先级=${priority}${missionNote}`);
    
    this.processNext();
    return task;
  }

  async getAll(): Promise<QueueTask[]> {
    const db = await getDb();
    return await db.all('SELECT * FROM tasks');
  }

  async getPending(): Promise<QueueTask[]> {
    const db = await getDb();
    return await db.all(
      'SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, createdAt ASC',
      'pending'
    );
  }

  async getTask(id: string): Promise<QueueTask | null> {
    const db = await getDb();
    const task = await db.get<QueueTask>('SELECT * FROM tasks WHERE id = ?', id);
    return task || null;
  }

  async recover(): Promise<RecoverResult> {
    const db = await getDb();
    let totalRecovered = 0;

    const expiryThresh = Date.now() - MAX_TASK_AGE_MS;
    await db.run('DELETE FROM tasks WHERE status IN (?, ?) AND createdAt < ?', 'done', 'failed', expiryThresh);

    const recoveredRunningTasks = await db.all<Array<{ id: string }>>(
      'SELECT id FROM tasks WHERE status = ?',
      'running'
    );
    const recoveredRunningTaskIds = recoveredRunningTasks.map(task => task.id);
    
    const res = await db.run(`UPDATE tasks SET status = 'pending', startedAt = NULL WHERE status = 'running'`);
    if (res.changes && res.changes > 0) {
      totalRecovered += res.changes;
      logger.info(`[TaskQueue] 🔄 恢复中断任务: ${res.changes} 个`);
    }

    const pendingCount = (await db.get('SELECT COUNT(*) as c FROM tasks WHERE status = ?', 'pending'))?.c || 0;
    totalRecovered += pendingCount;

    return {
      totalRecovered,
      recoveredRunningTaskIds,
    };
  }

  async processNext(): Promise<void> {
    if (this.runningCount >= this.concurrency || !this.processCallback) return;

    const pending = await this.getPending();
    if (pending.length === 0) return;

    const task = pending[0]!;
    this.runningCount++;

    task.status = 'running';
    task.startedAt = Date.now();
    await this.saveTask(task);

    logger.info(`[TaskQueue] 🔄 并发: ${this.runningCount}/${this.concurrency}`);
    logger.info(`[TaskQueue] ▶️ 开始处理: "${task.query}" [${task.depth}] (队列剩余: ${pending.length - 1})`);

    try {
      await this.processCallback(task);
      const persistedTask = await this.getTask(task.id);
      task.completedAt = Date.now();
      if (persistedTask?.status === 'canceled') {
        task.status = 'canceled';
        await this.saveTask(task);
        logger.info(`[TaskQueue] 🛑 已取消: "${task.query}"`);
      } else {
        task.status = 'done';
        await this.saveTask(task);
        logger.info(`[TaskQueue] ✅ 完成: "${task.query}" (${((task.completedAt - (task.startedAt || task.createdAt)) / 1000).toFixed(1)}s)`);
      }
    } catch (e: any) {
      const persistedTask = await this.getTask(task.id);
      const canceled = persistedTask?.status === 'canceled' || e.message === 'Canceled by user';
      task.status = canceled ? 'canceled' : 'failed';
      task.error = canceled ? undefined : e.message;
      task.completedAt = Date.now();
      await this.saveTask(task);
      if (canceled) {
        logger.info(`[TaskQueue] 🛑 已取消: "${task.query}"`);
      } else {
        logger.error(`[TaskQueue] ❌ 失败: "${task.query}" — ${e.message}`);
      }
    } finally {
      this.runningCount--;
      this.processNext();
    }
  }

  async updateProgress(id: string, progress: 'scout' | 'analyst' | 'strategist' | 'council' | 'synthesis') {
    const db = await getDb();
    await db.run('UPDATE tasks SET progress = ? WHERE id = ?', progress, id);
  }

  async cancelTask(id: string): Promise<QueueTask | null> {
    const db = await getDb();
    const task = await db.get<QueueTask>('SELECT * FROM tasks WHERE id = ?', id);
    if (task && (task.status === 'pending' || task.status === 'running')) {
      await db.run("UPDATE tasks SET status = 'canceled' WHERE id = ?", id);
      logger.info(`[TaskQueue] 🛑 强制中止任务: "${task.query}" (id=${task.id})`);
      return { ...task, status: 'canceled' };
    }
    return task || null;
  }

  async updateTaskState(id: string, payload: string) {
    const db = await getDb();
    await db.run('UPDATE tasks SET statePayload = ? WHERE id = ?', payload, id);
  }

  async attachRunId(id: string, runId: string) {
    const db = await getDb();
    await db.run('UPDATE tasks SET runId = ? WHERE id = ?', runId, id);
  }

  getRunningCount(): number {
    return this.runningCount;
  }

  async getStatusSummary(): Promise<string> {
    const db = await getDb();
    const rows = await db.all('SELECT status, COUNT(*) as count FROM tasks GROUP BY status');
    
    let stats = { pending: 0, running: 0, done: 0, failed: 0, canceled: 0 };
    rows.forEach(r => {
      if (stats.hasOwnProperty(r.status)) {
        (stats as any)[r.status] = r.count;
      }
    });

    return `队列: ${stats.pending} 待处理 | ${stats.running} 运行中 | ${stats.done} 已完成 | ${stats.failed} 失败 | ${stats.canceled} 已取消`;
  }

  private async saveTask(task: QueueTask) {
    const db = await getDb();
    await db.run(`
      INSERT INTO tasks (id, missionId, runId, query, depth, priority, source, status, progress, statePayload, createdAt, startedAt, completedAt, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        missionId = excluded.missionId,
        runId = excluded.runId,
        status = excluded.status,
        progress = excluded.progress,
        statePayload = excluded.statePayload,
        startedAt = excluded.startedAt,
        completedAt = excluded.completedAt,
        error = excluded.error
    `, 
      task.id, task.missionId || null, task.runId || null, task.query, task.depth, task.priority, task.source, 
      task.status, task.progress, task.statePayload || null, task.createdAt, task.startedAt || null, task.completedAt || null, task.error || null
    );
  }
}

export const taskQueue = new TaskQueue();
