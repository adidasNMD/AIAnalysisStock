process.env.OPENCLAW_ENABLE_API = 'false';
process.env.OPENCLAW_WORKER_BOOTSTRAP = '1';

// Reuse the legacy worker bootstrap while preventing it from binding the API port.
require('../worker');
