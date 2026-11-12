/**
 * The BigQuery side of the sink. Used only when BIGQUERY_PROJECT_ID, BIGQUERY_DATASET and
 * BIGQUERY_TABLE are set; authentication comes from Application Default Credentials
 * (`gcloud auth application-default login`, or GOOGLE_APPLICATION_CREDENTIALS = a service-account
 * key file with the BigQuery Data Editor role on the dataset).
 */

/** One impression = one row. Schema used by scripts/bigquery-setup.ts. */
export interface ImpressionRow {
  event_id: string;
  event_time: string;
  event_type: string;
  feature_name: string;
  enabled: boolean;
  variant: string | null;
  user_id: string | null;
  session_id: string | null;
  environment: string;
  app_name: string;
  context_json: string;
}

export const SCHEMA = [
  { name: 'event_id', type: 'STRING', mode: 'REQUIRED', description: 'UUID set by the app; also the BigQuery insertId for de-duplication' },
  { name: 'event_time', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'When the flag was evaluated' },
  { name: 'event_type', type: 'STRING', mode: 'REQUIRED', description: 'isEnabled or getVariant' },
  { name: 'feature_name', type: 'STRING', mode: 'REQUIRED' },
  { name: 'enabled', type: 'BOOL', mode: 'REQUIRED' },
  { name: 'variant', type: 'STRING', mode: 'NULLABLE', description: 'Assigned variant (control/treatment, or slot of the 2-allocation flag)' },
  { name: 'user_id', type: 'STRING', mode: 'NULLABLE' },
  { name: 'session_id', type: 'STRING', mode: 'NULLABLE' },
  { name: 'environment', type: 'STRING', mode: 'REQUIRED' },
  { name: 'app_name', type: 'STRING', mode: 'REQUIRED' },
  { name: 'context_json', type: 'JSON', mode: 'NULLABLE', description: 'Full Unleash context used for the evaluation' },
];

export interface BigQueryConfig {
  projectId: string;
  dataset: string;
  table: string;
  location: string;
}

export const bigQueryConfig = (): BigQueryConfig | null => {
  const projectId = process.env.BIGQUERY_PROJECT_ID?.trim();
  const dataset = process.env.BIGQUERY_DATASET?.trim();
  const table = process.env.BIGQUERY_TABLE?.trim();
  if (!projectId || !dataset || !table) return null;
  return { projectId, dataset, table, location: process.env.BIGQUERY_LOCATION?.trim() || 'US' };
};

/** Batches rows and streams them into BigQuery every `intervalMs`. */
export const createBigQueryWriter = async (config: BigQueryConfig, intervalMs = 2000) => {
  // Optional dependency: only loaded when BigQuery is configured.
  const { BigQuery } = await import('@google-cloud/bigquery');
  const table = new BigQuery({ projectId: config.projectId }).dataset(config.dataset).table(config.table);
  let queue: ImpressionRow[] = [];
  let written = 0;
  let lastError: string | null = null;

  const flush = async (): Promise<void> => {
    if (queue.length === 0) return;
    const batch = queue.splice(0, 500);
    try {
      await table.insert(batch.map((row) => ({ insertId: row.event_id, json: row })), { raw: true });
      written += batch.length;
      lastError = null;
    } catch (error) {
      // PartialFailureError lists the rows BigQuery refused; the rest went in.
      const failed = (error as { errors?: unknown[] }).errors?.length ?? batch.length;
      written += batch.length - failed;
      lastError = String((error as Error).message ?? error);
      console.error(`[bigquery] ${failed} row(s) failed: ${lastError}`);
    }
  };
  setInterval(() => void flush(), intervalMs).unref();

  return {
    push: (rows: ImpressionRow[]) => void queue.push(...rows),
    stats: () => ({ target: `${config.projectId}.${config.dataset}.${config.table}`, written, pending: queue.length, lastError }),
  };
};
