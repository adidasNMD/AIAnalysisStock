import { Router, Request, Response } from 'express';
import { getTraceByMissionId, getTraceByRunId } from '../../utils/agent-logger';
import {
  sendBadRequest,
  sendInternalError,
  sendNotFound,
} from '../route-helpers';
import * as fs from 'fs';
import * as path from 'path';

export const artifactsRouter = Router();

function listDatedFiles(rootDir: string, extension: string): Array<{ date: string; filename: string }> {
  if (!fs.existsSync(rootDir)) return [];

  const dates = fs.readdirSync(rootDir)
    .filter(date => fs.statSync(path.join(rootDir, date)).isDirectory());
  const files: Array<{ date: string; filename: string }> = [];

  for (const date of dates) {
    const dateDir = path.join(rootDir, date);
    const datedFiles = fs.readdirSync(dateDir).filter(file => file.endsWith(extension));
    for (const filename of datedFiles) {
      files.push({ date, filename });
    }
  }

  return files.sort((a, b) => (b.date + b.filename).localeCompare(a.date + a.filename));
}

artifactsRouter.get('/reports', (_req: Request, res: Response) => {
  try {
    res.json(listDatedFiles(path.join(process.cwd(), 'out', 'reports'), '.md'));
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

artifactsRouter.get('/reports/content', (req: Request, res: Response) => {
  try {
    const { date, filename } = req.query;
    if (!date || !filename || typeof date !== 'string' || typeof filename !== 'string') {
      return sendBadRequest(res, 'Missing date or filename');
    }

    const reportPath = path.join(
      process.cwd(),
      'out',
      'reports',
      path.basename(date),
      path.basename(filename),
    );
    if (!fs.existsSync(reportPath)) {
      return sendNotFound(res, 'Report not found');
    }

    return res.json({ content: fs.readFileSync(reportPath, 'utf-8') });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

artifactsRouter.get('/traces', (_req: Request, res: Response) => {
  try {
    res.json(listDatedFiles(path.join(process.cwd(), 'out', 'traces'), '.json'));
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

artifactsRouter.get('/traces/content', (req: Request, res: Response) => {
  try {
    const { date, filename } = req.query;
    if (!date || !filename || typeof date !== 'string' || typeof filename !== 'string') {
      return sendBadRequest(res, 'Missing date or filename');
    }

    const tracePath = path.join(
      process.cwd(),
      'out',
      'traces',
      path.basename(date),
      path.basename(filename),
    );
    if (!fs.existsSync(tracePath)) {
      return sendNotFound(res, 'Trace not found');
    }

    return res.json({ content: JSON.parse(fs.readFileSync(tracePath, 'utf-8')) });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

artifactsRouter.get('/traces/byMission/:missionId/runs/:runId', (req: Request, res: Response) => {
  try {
    const trace = getTraceByRunId(req.params.missionId as string, req.params.runId as string);
    if (!trace) {
      return sendNotFound(res, 'Trace not found for mission run');
    }
    return res.json({ content: trace });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

artifactsRouter.get('/traces/byMission/:missionId', (req: Request, res: Response) => {
  try {
    const trace = getTraceByMissionId(req.params.missionId as string);
    if (!trace) {
      return sendNotFound(res, 'Trace not found for mission');
    }
    return res.json({ content: trace });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});
