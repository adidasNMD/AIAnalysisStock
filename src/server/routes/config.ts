import { Router, Request, Response } from 'express';
import { getRuntimeConfig, updateRuntimeConfig } from '../../config';
import { getTokenUsage } from '../../utils/llm';
import { getFullConfig, reloadConfig, saveModelsConfig } from '../../utils/model-config';
import {
  modelsConfigPayloadSchema,
  runtimeConfigPatchSchema,
  sendValidationError,
} from '../validation';

export const configRouter = Router();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

configRouter.get('/config/models', (_req: Request, res: Response) => {
  try {
    res.json(getFullConfig());
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

configRouter.put('/config/models', (req: Request, res: Response) => {
  try {
    const parsed = modelsConfigPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid models config payload');
    }
    saveModelsConfig(parsed.data);
    const updated = reloadConfig();
    res.json({ success: true, config: updated });
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

configRouter.get('/config', (_req: Request, res: Response) => {
  res.json(getRuntimeConfig());
});

configRouter.patch('/config', (req: Request, res: Response) => {
  const parsed = runtimeConfigPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error, 'Invalid runtime config payload');
  }

  const patch: {
    t1Enabled?: boolean;
    leaderTickers?: string[];
    sma250VetoEnabled?: boolean;
  } = {};
  if (parsed.data.t1Enabled !== undefined) patch.t1Enabled = parsed.data.t1Enabled;
  if (parsed.data.leaderTickers !== undefined) patch.leaderTickers = parsed.data.leaderTickers;
  if (parsed.data.sma250VetoEnabled !== undefined) patch.sma250VetoEnabled = parsed.data.sma250VetoEnabled;

  res.json(updateRuntimeConfig(patch));
});

configRouter.get('/token-usage', (_req: Request, res: Response) => {
  res.json(getTokenUsage());
});
