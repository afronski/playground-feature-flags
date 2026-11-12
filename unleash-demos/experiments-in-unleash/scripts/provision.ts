/**
 * Provision "Experiments in Unleash" in Unleash Enterprise (hosted) through the Admin API.
 *
 * Safe to run again: every step either finds what exists or replaces it with the baseline from
 * src/flags.ts. Running it again is also how you reset the demo between rehearsals (for example,
 * it switches every flag off again, in development and production).
 *
 *   npm run provision
 */
import { ENVIRONMENTS, FLAG_SPECS, HOLDOUT, type FlagSpec, type Environment } from '../src/flags.ts';
import { admin, client, expectOk, json, ok, readEnv, requireEnv, BASE_URL, PROJECT } from './api.ts';
import { setChangeRequests, withChangeRequestsDisabled } from './change-requests.ts';
import { setEnvValue } from './dotenv.ts';

const APPROVER_ROLE = 'Change Request Approver (experiments demo)';
const tokenVar = (env: Environment): string => `UNLEASH_API_TOKEN_${env.toUpperCase()}`;

// ── 0. Who am I, and does the instance have the environments we need? ─────────────────────────────

const checkAccess = async (): Promise<void> => {
  const { data } = expectOk('Reading the current user (check UNLEASH_URL and UNLEASH_PAT)', await admin<{ email?: string; username?: string }>('/user'));
  console.log(`✓ Connected to ${BASE_URL} as ${data.email ?? data.username ?? 'unknown user'}`);

  const { data: envs } = expectOk('Listing environments', await admin<{ environments: { name: string; enabled: boolean }[] }>('/environments'));
  const names = new Set(envs.environments.filter((env) => env.enabled).map((env) => env.name));
  const missing = ENVIRONMENTS.filter((env) => !names.has(env));
  if (missing.length > 0) {
    console.error(`✗ The instance has no enabled environment(s): ${missing.join(', ')}`);
    process.exit(1);
  }
};

// ── 1. Project ───────────────────────────────────────────────────────────────────────────────────

const ensureProject = async (): Promise<void> => {
  const created = await admin('/projects', {
    method: 'POST',
    body: json({
      id: PROJECT,
      name: 'Experiments in Unleash',
      description: 'Gradual rollout with an experiment, mutually exclusive experiments, holdout and four-eyes approval.',
      environments: [...ENVIRONMENTS],
    }),
  });
  expectOk(`Creating project ${PROJECT}`, created, [409]);
  console.log(created.status === 409 ? `✓ Project ${PROJECT} exists` : `✓ Project ${PROJECT} created`);

  for (const env of ENVIRONMENTS) {
    // 409 = the environment is already on for this project.
    expectOk(`Enabling ${env} on ${PROJECT}`, await admin(`/projects/${PROJECT}/environments`, { method: 'POST', body: json({ environment: env }) }), [409]);
  }
};

// ── 2a. Holdout group: context field + exclusion segment ─────────────────────────────────────────

const ensureHoldoutContextField = async (): Promise<void> => {
  const body = {
    name: HOLDOUT.contextField,
    description: 'true when the data team puts the user in the long-term holdout group',
    stickiness: false,
    legalValues: [
      { value: 'true', description: 'In the holdout group: every flag stays off' },
      { value: 'false', description: 'Eligible for rollouts and experiments' },
    ],
  };
  // Project-scoped first (keeps the instance-wide list clean); fall back to a global field.
  let res = await admin('/context', { method: 'POST', body: json({ ...body, project: PROJECT }) });
  if (res.status === 400) res = await admin('/context', { method: 'POST', body: json(body) });
  expectOk(`Creating context field ${HOLDOUT.contextField}`, res, [409]);
  console.log(`✓ Context field ${HOLDOUT.contextField} ${res.status === 409 ? 'exists' : 'created'}`);
};

const ensureHoldoutSegment = async (): Promise<number> => {
  const body = {
    name: HOLDOUT.segment,
    description: HOLDOUT.description,
    project: PROJECT,
    // "holdout IN [true]", inverted: true for everyone NOT in the holdout group (also when unset).
    constraints: [{ contextName: HOLDOUT.contextField, operator: 'IN', values: ['true'], inverted: true, caseInsensitive: false }],
  };
  const { data } = expectOk('Listing segments', await admin<{ id: number; name: string }[] | { segments: { id: number; name: string }[] }>('/segments'));
  const list = Array.isArray(data) ? data : data.segments;
  const existing = list.find((segment) => segment.name === HOLDOUT.segment);

  if (existing) {
    expectOk(`Updating segment ${HOLDOUT.segment}`, await admin(`/segments/${existing.id}`, { method: 'PUT', body: json(body) }));
    console.log(`✓ Segment ${HOLDOUT.segment} reset (holdout NOT IN [true])`);
    return existing.id;
  }
  const { data: created } = expectOk(`Creating segment ${HOLDOUT.segment}`, await admin<{ id: number }>('/segments', { method: 'POST', body: json(body) }));
  console.log(`✓ Segment ${HOLDOUT.segment} created (holdout NOT IN [true])`);
  return created.id;
};

// ── 2. Flags, strategies with JSON-payload variants, dependencies, on/off per environment ───────

const strategyBody = (spec: FlagSpec, segmentId: number) => ({
  name: 'flexibleRollout',
  constraints: [],
  segments: [segmentId], // holdout group exclusion, on every strategy
  parameters: { rollout: String(spec.rollout), stickiness: 'userId', groupId: spec.name },
  // Unleash wants at least one "variable" variant: every variant but the last is fixed at its
  // weight, the last one takes whatever is left of 1000 (the weights in src/flags.ts sum to 1000).
  variants: spec.variants.map((variant, index) => ({
    name: variant.name,
    weight: variant.weight,
    weightType: index === spec.variants.length - 1 ? 'variable' : 'fix',
    stickiness: 'userId',
    payload: { type: 'json', value: JSON.stringify(variant.payload) },
  })),
});

const ensureFlag = async (spec: FlagSpec): Promise<void> => {
  const created = await admin(`/projects/${PROJECT}/features`, {
    method: 'POST',
    body: json({ name: spec.name, type: spec.type, description: spec.description, impressionData: true }),
  });
  expectOk(`Creating flag ${spec.name}`, created, [409]);

  if (created.status === 409) {
    expectOk(
      `Updating flag ${spec.name}`,
      await admin(`/projects/${PROJECT}/features/${spec.name}`, {
        method: 'PATCH',
        body: json([
          { op: 'replace', path: '/description', value: spec.description },
          { op: 'replace', path: '/type', value: spec.type },
          { op: 'replace', path: '/impressionData', value: true },
        ]),
      }),
    );
  }
  console.log(`✓ Flag ${spec.name} (${created.status === 409 ? 'updated' : 'created'}, impression data on)`);
};

const ensureDependency = async (spec: FlagSpec): Promise<void> => {
  if (!spec.dependsOn) return;
  const path = `/projects/${PROJECT}/features/${spec.name}/dependencies`;
  // Replace rather than merge, so a re-run always lands on the baseline.
  expectOk(`Removing old dependencies of ${spec.name}`, await admin(path, { method: 'DELETE' }), [404]);
  expectOk(
    `Adding dependency ${spec.name} → ${spec.dependsOn.feature}`,
    await admin(path, { method: 'POST', body: json({ feature: spec.dependsOn.feature, enabled: true, variants: spec.dependsOn.variants }) }),
  );
  console.log(`✓ ${spec.name} depends on ${spec.dependsOn.feature} = [${spec.dependsOn.variants.join(', ')}]`);
};

const ensureStrategy = async (spec: FlagSpec, env: Environment, segmentId: number): Promise<void> => {
  const base = `/projects/${PROJECT}/features/${spec.name}/environments/${env}`;
  const { data } = expectOk(`Reading strategies of ${spec.name}/${env}`, await admin<{ id: string }[]>(`${base}/strategies`));
  const existing = Array.isArray(data) ? data : [];
  const body = json(strategyBody(spec, segmentId));

  if (existing.length === 0) {
    expectOk(`Adding strategy to ${spec.name}/${env}`, await admin(`${base}/strategies`, { method: 'POST', body }));
  } else {
    // Overwrite the first strategy in place and drop the rest, so the flag never sits with none.
    const [first, ...rest] = existing;
    expectOk(`Updating strategy of ${spec.name}/${env}`, await admin(`${base}/strategies/${first.id}`, { method: 'PUT', body }));
    for (const extra of rest) {
      expectOk(`Removing extra strategy of ${spec.name}/${env}`, await admin(`${base}/strategies/${extra.id}`, { method: 'DELETE' }), [404]);
    }
  }

  const on = spec.enabledIn[env];
  expectOk(`Turning ${spec.name}/${env} ${on ? 'on' : 'off'}`, await admin(`${base}/${on ? 'on' : 'off'}`, { method: 'POST' }));
  console.log(`  ${env.padEnd(11)} rollout ${String(spec.rollout).padStart(3)}%  ${on ? 'ON ' : 'OFF'}  variants ${spec.variants.map((v) => `${v.name}:${v.weight / 10}%`).join(' ')}`);
};

// ── 3. Four-eyes: change requests on production + a second user who may approve them ────────────

const ensureApprover = async (): Promise<void> => {
  const email = requireEnv('UNLEASH_APPROVER_EMAIL', 'The four-eyes demo needs a second Unleash user who approves change requests.');
  const name = readEnv('UNLEASH_APPROVER_NAME') || 'Demo Approver';

  // Custom project role: may approve change requests in production, nothing else.
  const { data: roleList } = expectOk('Listing roles', await admin<{ roles: { id: number; name: string }[] }>('/roles'));
  let role = roleList.roles.find((r) => r.name === APPROVER_ROLE);
  if (!role) {
    const { data } = expectOk(
      `Creating role "${APPROVER_ROLE}"`,
      await admin<{ roles: { id: number; name: string } }>('/roles', {
        method: 'POST',
        body: json({
          name: APPROVER_ROLE,
          description: 'Approves change requests in production for the experiments demo. Cannot apply them.',
          type: 'custom',
          permissions: [{ name: 'APPROVE_CHANGE_REQUEST', environment: 'production' }],
        }),
      }),
    );
    role = data.roles;
    console.log(`✓ Role "${APPROVER_ROLE}" created`);
  } else {
    console.log(`✓ Role "${APPROVER_ROLE}" exists`);
  }

  // The user, with the read-only Viewer root role.
  const { data: found } = expectOk('Searching users', await admin<{ id: number; email?: string }[]>(`/user-admin/search?q=${encodeURIComponent(email)}`));
  let user = (Array.isArray(found) ? found : []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const password = requireEnv('UNLEASH_APPROVER_PASSWORD', 'Needed once, to create the approver user.');
    const { data } = expectOk(
      `Creating user ${email}`,
      await admin<{ id: number; email: string }>('/user-admin', {
        method: 'POST',
        body: json({ email, name, password, rootRole: 'Viewer', sendEmail: false }),
      }),
    );
    user = data;
    console.log(`✓ Approver user ${email} created (Viewer); log in with UNLEASH_APPROVER_PASSWORD`);
  } else {
    console.log(`✓ Approver user ${email} exists (password left as is)`);
  }

  // Grant the role on this project, unless already granted.
  const { data: access } = expectOk('Reading project access', await admin<{ users?: { id: number; roles?: number[]; roleId?: number }[] }>(`/projects/${PROJECT}/access`));
  const entry = access.users?.find((u) => u.id === user.id);
  const hasRole = entry && (entry.roles?.includes(role.id) || entry.roleId === role.id);
  if (!hasRole) {
    expectOk(
      `Granting "${APPROVER_ROLE}" on ${PROJECT} to ${email}`,
      await admin(`/projects/${PROJECT}/access`, { method: 'POST', body: json({ roles: [role.id], groups: [], users: [user.id] }) }),
      [409],
    );
  }
  console.log(`✓ ${email} may approve change requests in ${PROJECT}/production`);
};

// ── 4. Backend SDK tokens, one per environment, written to .env ──────────────────────────────────

const tokenWorks = async (token: string): Promise<boolean> => {
  if (!token) return false;
  const { status, data } = await client<{ features?: { name: string }[] }>('/features', token);
  return status === 200 && (data.features ?? []).some((feature) => feature.name === FLAG_SPECS[0].name);
};

const ensureToken = async (env: Environment): Promise<void> => {
  const key = tokenVar(env);
  if (await tokenWorks(readEnv(key))) {
    console.log(`✓ ${key} in .env works`);
    return;
  }

  const create = (tokenName: string) =>
    admin<{ secret?: string }>(`/projects/${PROJECT}/api-tokens`, {
      method: 'POST',
      body: json({ tokenName, type: 'backend', environment: env, projects: [PROJECT] }),
    });

  // Token names must be unique; a token whose secret we lost cannot be read back, so make a new one.
  let created = await create(`${PROJECT}-backend-${env}`);
  if (created.status === 409 || created.status === 400) created = await create(`${PROJECT}-backend-${env}-${Date.now()}`);
  const { data } = expectOk(`Creating backend token for ${env}`, created);
  if (!data.secret) {
    console.error(`✗ Unleash did not return a secret for the ${env} token`);
    process.exit(1);
  }

  setEnvValue(key, data.secret);
  // The SDK may need a moment before a fresh token sees the flags.
  for (let attempt = 0; attempt < 10 && !(await tokenWorks(data.secret)); attempt++) await new Promise((r) => setTimeout(r, 1000));
  console.log(`✓ ${key} created and saved to .env`);
};

// ── Run ──────────────────────────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('\n0. Access');
  await checkAccess();

  console.log('\n1. Project');
  await ensureProject();

  console.log('\n2. Holdout group and flags (baseline)');
  await withChangeRequestsDisabled(PROJECT, ENVIRONMENTS, async () => {
    await ensureHoldoutContextField();
    const segmentId = await ensureHoldoutSegment();
    for (const spec of FLAG_SPECS) await ensureFlag(spec);
    for (const spec of FLAG_SPECS) await ensureDependency(spec);
    for (const spec of FLAG_SPECS) {
      console.log(`  ${spec.name}  (segment ${HOLDOUT.segment} on every strategy)`);
      for (const env of ENVIRONMENTS) await ensureStrategy(spec, env, segmentId);
    }
  });

  console.log('\n3. Four-eyes approval');
  expectOk('Turning on change requests in production', { status: await setChangeRequests(PROJECT, 'production', true, 1), data: null });
  console.log('✓ Change requests on in production (1 approval required)');
  await ensureApprover();

  console.log('\n4. SDK tokens');
  for (const env of ENVIRONMENTS) await ensureToken(env);

  console.log(`\nDone. Open ${BASE_URL}/projects/${PROJECT} and run: npm run dev\n`);
};

await main();
