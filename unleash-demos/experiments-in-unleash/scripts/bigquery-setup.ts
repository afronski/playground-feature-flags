/**
 * Create the BigQuery dataset and impressions table the sink writes to.
 * Table is partitioned by day on event_time and clustered by feature_name, user_id.
 *
 *   npm run bigquery:setup
 */
import { bigQueryConfig, SCHEMA } from '../src/bigquery.ts';

const config = bigQueryConfig();
if (!config) {
  console.error('Set BIGQUERY_PROJECT_ID, BIGQUERY_DATASET and BIGQUERY_TABLE in .env first.');
  process.exit(1);
}

const { BigQuery } = await import('@google-cloud/bigquery');
const bq = new BigQuery({ projectId: config.projectId });

const dataset = bq.dataset(config.dataset);
const [datasetExists] = await dataset.exists();
if (!datasetExists) {
  await bq.createDataset(config.dataset, { location: config.location });
  console.log(`✓ Dataset ${config.projectId}.${config.dataset} created (${config.location})`);
} else {
  console.log(`✓ Dataset ${config.projectId}.${config.dataset} exists`);
}

const table = dataset.table(config.table);
const [tableExists] = await table.exists();
if (!tableExists) {
  await dataset.createTable(config.table, {
    schema: { fields: SCHEMA },
    timePartitioning: { type: 'DAY', field: 'event_time' },
    clustering: { fields: ['feature_name', 'user_id'] },
    description: 'Unleash impression events from the experiments demo (one row per flag evaluation).',
  });
  console.log(`✓ Table ${config.projectId}.${config.dataset}.${config.table} created`);
} else {
  console.log(`✓ Table ${config.projectId}.${config.dataset}.${config.table} exists`);
}
