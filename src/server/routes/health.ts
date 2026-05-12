import { Router, Request, Response } from 'express';
import {
  getCoreHealth,
  getExternalServiceHealth,
} from '../services/health-service';
import { sendInternalError } from '../route-helpers';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json(getCoreHealth());
});

healthRouter.get('/health/services', async (_req: Request, res: Response) => {
  try {
    res.json(await getExternalServiceHealth());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});
