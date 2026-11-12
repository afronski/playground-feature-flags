/** Set `KEY=value` in .env, replacing an existing line or appending a new one. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV_FILE = new URL('../.env', import.meta.url);

export const setEnvValue = (key: string, value: string): void => {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split('\n') : [];
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, `${key}=${value}`);
  writeFileSync(ENV_FILE, lines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  process.env[key] = value;
};
