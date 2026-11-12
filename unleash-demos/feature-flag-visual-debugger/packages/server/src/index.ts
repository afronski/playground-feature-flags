import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import tracesRouter from './routes/traces.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', tracesRouter);

app.listen(config.port, () => {
  console.log(`Flag Debugger API listening on port ${config.port}`);
});
