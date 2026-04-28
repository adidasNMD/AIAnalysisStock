import { getDb } from '../db';
import { logger } from './logger';
import type { AnalysisDepth } from '../models/handoff';
import { classifyExecutionFailure, getErrorMessage } from './error-classification';

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
  inputPayload?: string;
  dedupeKey?: string;
  idempotencyKey?: string;
  inputHash?: string;
  leaseId?: string;
  heartbeatAt?: number;
  cancelRequestedAt?: number;
  failureCode?: string;
  degradedFlags?: string;
}

export interface RecoverResult {
  totalRecovered: number;
  recoveredRunningTaskIds: string[];
}

export interface StaleRecoverResult {
  totalRecovered: number;
  recoveredRunningTaskIds: string[];
  skippedActiveTaskIds: string[];
  staleThresholdMs: number;
}

export interface EnqueueTaskOptions {
  missionId?: string;
  inputPayload?: string;
  dedupeKey?: string;
  idempotencyKey?: string;
  inputHash?: string;
}

const MAX_TASK_AGE_MS = 2 * 60 * 60 * 1000; 
const STALE_TASK_HEARTBEAT_MS = 2 * 60 * 1000;

export class TaskQueue {
  private concurrency: number;
  private runningCount = 0;
  private processCallback: ((task: QueueTask) => Promise<void>) | null = null;
  private abortControllers = new Map<string, AbortController>();

  constructor() {
    this.concurrency = Number(process.env.TASK_QUEUE_CONCURRENCY) || 3;
  }

  onProcess(callback: (task: QueueTask) => Promise<void>) {
    this.processCallback = callback;
  }

  registerAbortController(taskId: string, controller: AbortController): () => void {
    this.abortControllers.set(taskId, controller);
    return () => {
      if (this.abortControllers.get(taskId) === controller) {
        this.abortControllers.delete(taskId);
      }
    };
  }

  async enqueue(
    query: string,
    depth: AnalysisDepth,
    source: string,
    priority = 0,
    missionOrOptions?: string | EnqueueTaskOptions,
  ): Promise<QueueTask | null> {
    const db = await getDb();
    const options: EnqueueTaskOptions = typeof missionOrOptions === 'string'
      ? { missionId: missionOrOptions }
      : missionOrOptions || {};

    const existing = options.idempotencyKey
      ? await db.get(
          'SELECT id, missionId, status FROM tasks WHERE idempotencyKey = ? AND status IN (?, ?, ?)',
          options.idempotencyKey,
          'pending',
          'running',
          'done',
        )
      : options.dedupeKey
        ? await db.get(
            'SELECT id, missionId, status FROM tasks WHERE dedupeKey = ? AND status IN (?, ?)',
            options.dedupeKey,
            'pending',
            'running',
          )
        : await db.get(
            'SELECT id, missionId, status FROM tasks WHERE query = ? AND status IN (?, ?)',
            query,
            'pending',
            'running',
          );
    if (existing) {
      const missionNote = existing.missionId ? ` mission=${existing.missionId}` : '';
      const identityNote = options.idempotencyKey
        ? ` idempotencyKey=${options.idempotencyKey}`
        : options.dedupeKey
          ? ` dedupeKey=${options.dedupeKey}`
          : '';
      logger.info(`[TaskQueue] ⏭️ 跳过重复任务: "${query}" (已存在 ${existing.status} 任务 ${existing.id}${missionNote}${identityNote})`);
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
    if (options.missionId) {
      task.missionId = options.missionId;
    }
    if (options.inputPayload) {
      task.inputPayload = options.inputPayload;
    }
    if (options.dedupeKey) {
      task.dedupeKey = options.dedupeKey;
    }
    if (options.idempotencyKey) {
      task.idempotencyKey = options.idempotencyKey;
    }
    if (options.inputHash) {
      task.inputHash = options.inputHash;
    }

    await this.saveTask(task);
    const missionNote = options.missionId ? ` mission=${options.missionId}` : '';
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

  async getByIdempotencyKey(idempotencyKey: string): Promise<QueueTask | null> {
    const db = await getDb();
    const task = await db.get<QueueTask>(
      'SELECT * FROM tasks WHERE idempotencyKey = ? ORDER BY createdAt DESC LIMIT 1',
      idempotencyKey,
    );
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
    
    const res = await db.run(`
      UPDATE tasks
      SET status = 'pending',
          startedAt = NULL,
          leaseId = NULL,
          heartbeatAt = NULL
      WHERE status = 'running'
    `);
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

  async recoverStaleRunning(staleThresholdMs = STALE_TASK_HEARTBEAT_MS): Promise<StaleRecoverResult> {
    const db = await getDb();
    const staleBefore = Date.now() - staleThresholdMs;
    const runningTasks = await db.all<QueueTask[]>(
      'SELECT * FROM tasks WHERE status = ?',
      'running',
    );
    const staleTasks = runningTasks.filter((task) => {
      const heartbeatAt = typeof task.heartbeatAt === 'number' ? task.heartbeatAt : 0;
      return heartbeatAt === 0 || heartbeatAt < staleBefore;
    });
    const recoverableTasks = staleTasks.filter((task) => !this.abortControllers.has(task.id));
    const skippedActiveTaskIds = staleTasks
      .filter((task) => this.abortControllers.has(task.id))
      .map((task) => task.id);
    const recoveredRunningTaskIds = recoverableTasks.map((task) => task.id);

    if (recoveredRunningTaskIds.length === 0) {
      return {
        totalRecovered: 0,
        recoveredRunningTaskIds,
        skippedActiveTaskIds,
        staleThresholdMs,
      };
    }

    const placeholders = recoveredRunningTaskIds.map(() => '?').join(', ');
    const result = await db.run(
      `UPDATE tasks
        SET status = 'pending',
            progress = NULL,
            startedAt = NULL,
            leaseId = NULL,
            heartbeatAt = NULL,
            error = NULL,
            failureCode = NULL
        WHERE id IN (${placeholders})`,
      ...recoveredRunningTaskIds,
    );

    logger.info(`[TaskQueue] 🔄 恢复卡住任务: ${result.changes || 0} 个`);
    return {
      totalRecovered: result.changes || recoveredRunningTaskIds.length,
      recoveredRunningTaskIds,
      skippedActiveTaskIds,
      staleThresholdMs,
    };
  }

  async requeueTask(id: string): Promise<QueueTask | null> {
    const db = await getDb();
    const task = await db.get<QueueTask>('SELECT * FROM tasks WHERE id = ?', id);
    if (!task) return null;
    if (!['failed', 'canceled'].includes(task.status)) return task;

    await db.run(
      `UPDATE tasks
        SET status = 'pending',
            progress = NULL,
            startedAt = NULL,
            completedAt = NULL,
            leaseId = NULL,
            heartbeatAt = NULL,
            cancelRequestedAt = NULL,
            failureCode = NULL,
            error = NULL
        WHERE id = ?`,
      id,
    );

    logger.info(`[TaskQueue] 🔁 重新入队任务: "${task.query}" (id=${task.id})`);
    const nextTask: QueueTask = {
      ...task,
      status: 'pending',
    };
    delete nextTask.progress;
    delete nextTask.startedAt;
    delete nextTask.completedAt;
    delete nextTask.leaseId;
    delete nextTask.heartbeatAt;
    delete nextTask.cancelRequestedAt;
    delete nextTask.failureCode;
    delete nextTask.error;
    return nextTask;
  }

  async processNext(): Promise<void> {
    if (this.runningCount >= this.concurrency || !this.processCallback) return;

    const pending = await this.getPending();
    if (pending.length === 0) return;

    const task = pending[0]!;
    this.runningCount++;

    task.status = 'running';
    task.startedAt = Date.now();
    task.heartbeatAt = task.startedAt;
    await this.saveTask(task);

    logger.info(`[TaskQueue] 🔄 并发: ${this.runningCount}/${this.concurrency}`);
    logger.info(`[TaskQueue] ▶️ 开始处理: "${task.query}" [${task.depth}] (队列剩余: ${pending.length - 1})`);

    try {
      await this.processCallback(task);
      const persistedTask = await this.getTask(task.id);
      task.completedAt = Date.now();
      if (persistedTask?.status === 'canceled') {
        task.status = 'canceled';
        if (persistedTask.cancelRequestedAt !== undefined) {
          task.cancelRequestedAt = persistedTask.cancelRequestedAt;
        }
        task.failureCode = 'canceled';
        await this.saveTask(task);
        logger.info(`[TaskQueue] 🛑 已取消: "${task.query}"`);
      } else {
        task.status = 'done';
        await this.saveTask(task);
        logger.info(`[TaskQueue] ✅ 完成: "${task.query}" (${((task.completedAt - (task.startedAt || task.createdAt)) / 1000).toFixed(1)}s)`);
      }
    } catch (e: unknown) {
      const persistedTask = await this.getTask(task.id);
      const errorMessage = getErrorMessage(e);
      const failureCode = classifyExecutionFailure(e);
      const canceled = persistedTask?.status === 'canceled' || failureCode === 'canceled';
      task.status = canceled ? 'canceled' : 'failed';
      if (canceled) {
        delete task.error;
      } else {
        task.error = errorMessage;
      }
      if (persistedTask?.cancelRequestedAt !== undefined) {
        task.cancelRequestedAt = persistedTask.cancelRequestedAt;
      }
      task.failureCode = canceled ? 'canceled' : failureCode;
      task.completedAt = Date.now();
      await this.saveTask(task);
      if (canceled) {
        logger.info(`[TaskQueue] 🛑 已取消: "${task.query}"`);
      } else {
        logger.error(`[TaskQueue] ❌ 失败: "${task.query}" — ${errorMessage}`);
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
      const cancelRequestedAt = Date.now();
      await db.run(
        "UPDATE tasks SET status = 'canceled', cancelRequestedAt = ?, failureCode = ? WHERE id = ?",
        cancelRequestedAt,
        'canceled',
        id,
      );
      const controller = this.abortControllers.get(id);
      if (controller && !controller.signal.aborted) {
        controller.abort(new Error('Canceled by user'));
      }
      logger.info(`[TaskQueue] 🛑 强制中止任务: "${task.query}" (id=${task.id})`);
      return { ...task, status: 'canceled', cancelRequestedAt, failureCode: 'canceled' };
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

  async attachLease(id: string, leaseId: string) {
    const db = await getDb();
    await db.run('UPDATE tasks SET leaseId = ?, heartbeatAt = ? WHERE id = ?', leaseId, Date.now(), id);
  }

  async touchHeartbeat(id: string) {
    const db = await getDb();
    await db.run('UPDATE tasks SET heartbeatAt = ? WHERE id = ?', Date.now(), id);
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
      INSERT INTO tasks (
        id, missionId, runId, query, depth, priority, source, status, progress,
        statePayload, inputPayload, dedupeKey, idempotencyKey, inputHash, leaseId, heartbeatAt, cancelRequestedAt,
        failureCode, degradedFlags, createdAt, startedAt, completedAt, error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        missionId = excluded.missionId,
        runId = excluded.runId,
        status = excluded.status,
        progress = excluded.progress,
        statePayload = excluded.statePayload,
        inputPayload = COALESCE(excluded.inputPayload, tasks.inputPayload),
        dedupeKey = COALESCE(excluded.dedupeKey, tasks.dedupeKey),
        idempotencyKey = COALESCE(excluded.idempotencyKey, tasks.idempotencyKey),
        inputHash = COALESCE(excluded.inputHash, tasks.inputHash),
        leaseId = excluded.leaseId,
        heartbeatAt = excluded.heartbeatAt,
        cancelRequestedAt = COALESCE(excluded.cancelRequestedAt, tasks.cancelRequestedAt),
        failureCode = excluded.failureCode,
        degradedFlags = excluded.degradedFlags,
        startedAt = excluded.startedAt,
        completedAt = excluded.completedAt,
        error = excluded.error
    `, 
      task.id, task.missionId || null, task.runId || null, task.query, task.depth, task.priority, task.source, 
      task.status, task.progress, task.statePayload || null, task.inputPayload || null,
      task.dedupeKey || null, task.idempotencyKey || null, task.inputHash || null, task.leaseId || null,
      task.heartbeatAt || null, task.cancelRequestedAt || null, task.failureCode || null,
      task.degradedFlags || null, task.createdAt, task.startedAt || null, task.completedAt || null,
      task.error || null
    );
  }
}

export const taskQueue = new TaskQueue();
