import { startServer } from './app';
import { startModelsConfigWatcher } from '../utils/model-config';

const port = Number(process.env.OPENCLAW_API_PORT || process.env.PORT || 3000);

startModelsConfigWatcher();
startServer(port);
