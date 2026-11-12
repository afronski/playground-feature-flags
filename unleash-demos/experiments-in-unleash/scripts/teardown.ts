/**
 * Remove everything `npm run provision` created.
 *
 *   npm run teardown                       # flags, holdout segment + context field, SDK tokens, project
 *   npm run teardown -- --include-approver # … and the approver user and role
 *   npm run teardown -- --yes              # do not ask
 */
import { createInterface } from 'node:readline/promises';
import { ENVIRONMENTS, FLAG_SPECS, HOLDOUT } from '../src/flags.ts';
import { admin, expectOk, json, readEnv, BASE_URL, PROJECT } from './api.ts';
import { withChangeRequestsDisabled } from './change-requests.ts';

const APPROVER_ROLE = 'Change Request Approver (experiments demo)';
const args = new Set(process.argv.slice(2));
const includeApprover = args.has('--include-approver');

const confirm = async (): Promise<boolean> => {
  if (args.has('--yes')) return true;
  const what = [`project "${PROJECT}" with its flags, SDK tokens, segment ${HOLDOUT.segment} and context field ${HOLDOUT.contextField}`];
  if (includeApprover) what.push(`user ${readEnv('UNLEASH_APPROVER_EMAIL') || '(UNLEASH_APPROVER_EMAIL not set)'} and role "${APPROVER_ROLE}"`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Delete ${what.join(', and ')} on ${BASE_URL}? [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const deleteFlags = async (): Promise<void> => {
  const { data } = await admin<{ features?: { name: string }[] }>(`/search/features?project=IS:${PROJECT}&limit=1000`);
  const names = new Set([...(data.features ?? []).map((f) => f.name), ...FLAG_SPECS.map((f) => f.name)]);
  const features = [...names];

  // Archive children and parent in one call; archiving answers 202 and finishes in the background.
  await admin(`/projects/${PROJECT}/archive`, { method: 'POST', body: json({ features }) });
  for (let attempt = 0; attempt < 10; attempt++) {
    const { status } = await admin(`/projects/${PROJECT}/delete`, { method: 'POST', body: json({ features }) });
    if (status >= 200 && status < 300) {
      console.log(`✓ Flags deleted: ${features.join(', ')}`);
      return;
    }
    await sleep(1000);
  }
  console.warn('! Could not delete all flags from the archive; delete them in the UI.');
};

const deleteTokens = async (): Promise<void> => {
  const { status, data } = await admin<{ tokens?: { secret?: string; tokenName?: string }[] }>(`/projects/${PROJECT}/api-tokens`);
  if (status !== 200) return;
  for (const token of data.tokens ?? []) {
    if (!token.secret) continue;
    const res = await admin(`/projects/${PROJECT}/api-tokens/${encodeURIComponent(token.secret)}`, { method: 'DELETE' });
    console.log(`✓ Token ${token.tokenName ?? ''} deleted (HTTP ${res.status})`);
  }
};

// Segment first (strategies that used it are gone with the flags), then the context field it uses.
const deleteHoldout = async (): Promise<void> => {
  const { data } = await admin<{ id: number; name: string }[] | { segments?: { id: number; name: string }[] }>('/segments');
  const segment = (Array.isArray(data) ? data : (data.segments ?? [])).find((s) => s.name === HOLDOUT.segment);
  if (segment) {
    expectOk(`Deleting segment ${HOLDOUT.segment}`, await admin(`/segments/${segment.id}`, { method: 'DELETE' }), [404]);
    console.log(`✓ Segment ${HOLDOUT.segment} deleted`);
  }
  const res = await admin(`/context/${HOLDOUT.contextField}`, { method: 'DELETE' });
  if (res.status !== 404) {
    expectOk(`Deleting context field ${HOLDOUT.contextField}`, res);
    console.log(`✓ Context field ${HOLDOUT.contextField} deleted`);
  }
};

const deleteApprover = async (): Promise<void> => {
  const email = readEnv('UNLEASH_APPROVER_EMAIL');
  if (email) {
    const { data } = await admin<{ id: number; email?: string }[]>(`/user-admin/search?q=${encodeURIComponent(email)}`);
    const user = (Array.isArray(data) ? data : []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      expectOk(`Deleting user ${email}`, await admin(`/user-admin/${user.id}`, { method: 'DELETE' }), [404]);
      console.log(`✓ User ${email} deleted`);
    }
  }
  const { data: roles } = await admin<{ roles?: { id: number; name: string }[] }>('/roles');
  const role = roles.roles?.find((r) => r.name === APPROVER_ROLE);
  if (role) {
    expectOk(`Deleting role "${APPROVER_ROLE}"`, await admin(`/roles/${role.id}`, { method: 'DELETE' }), [404]);
    console.log(`✓ Role "${APPROVER_ROLE}" deleted`);
  }
};

const main = async (): Promise<void> => {
  if (!(await confirm())) {
    console.log('Nothing deleted.');
    return;
  }

  const { status } = await admin(`/projects/${PROJECT}/overview`);
  if (status === 200) {
    await withChangeRequestsDisabled(PROJECT, ENVIRONMENTS, deleteFlags);
    await deleteTokens();
    await deleteHoldout();
    expectOk(`Deleting project ${PROJECT}`, await admin(`/projects/${PROJECT}`, { method: 'DELETE' }), [404]);
    console.log(`✓ Project ${PROJECT} deleted`);
  } else {
    console.log(`Project ${PROJECT} not found, skipping.`);
  }

  if (includeApprover) await deleteApprover();
  console.log('\nDone. The UNLEASH_API_TOKEN_* values in .env no longer work; `npm run provision` makes new ones.');
};

await main();
