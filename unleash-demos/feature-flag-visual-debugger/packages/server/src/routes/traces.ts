import { Router, Request, Response } from 'express';
import { config } from '../config.js';

const router = Router();

// GET /api/traces — search traces
router.get('/traces', async (req: Request, res: Response) => {
  try {
    const params = new URLSearchParams();
    // Forward all query params to Jaeger
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        params.append(key, value);
      }
    }
    const url = `${config.jaegerQueryUrl}/api/traces?${params.toString()}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Jaeger unavailable' });
  }
});

// GET /api/traces/:traceId — get single trace
router.get('/traces/:traceId', async (req: Request, res: Response) => {
  try {
    const url = `${config.jaegerQueryUrl}/api/traces/${req.params.traceId}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Jaeger unavailable' });
  }
});

// GET /api/services — list services
router.get('/services', async (_req: Request, res: Response) => {
  try {
    const url = `${config.jaegerQueryUrl}/api/services`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Jaeger unavailable' });
  }
});

export default router;
