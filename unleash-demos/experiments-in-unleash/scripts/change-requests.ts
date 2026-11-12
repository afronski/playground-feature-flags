/**
 * Lift-then-restore guard for change requests, adapted from the FeatureOps workshop provisioner
 * (support/infrastructure/unleash-provisioner/src/setup/change-requests.ts).
 *
 * Why: in an environment with change requests on, a flag write does not apply. Unleash files it
 * as a draft change request and still answers 2xx, so provisioning would look fine and do nothing.
 */
import { admin, json } from './api.ts';

interface ChangeRequestConfig {
  environment: string;
  changeRequestEnabled: boolean;
  requiredApprovals?: number | null;
}

export const setChangeRequests = async (project: string, env: string, enabled: boolean, approvals = 1): Promise<number> => {
  const body = enabled ? { changeRequestsEnabled: true, requiredApprovals: approvals } : { changeRequestsEnabled: false };
  const { status } = await admin(`/projects/${project}/environments/${env}/change-requests/config`, {
    method: 'PUT',
    body: json(body),
  });
  return status;
};

const readConfig = async (project: string): Promise<ChangeRequestConfig[] | null> => {
  const { status, data } = await admin<ChangeRequestConfig[]>(`/projects/${project}/change-requests/config`);
  return status === 200 && Array.isArray(data) ? data : null;
};

/** Run `mutate` with change requests off in `envs`, then put back what was there before. */
export const withChangeRequestsDisabled = async <T>(project: string, envs: readonly string[], mutate: () => Promise<T>): Promise<T> => {
  const before = await readConfig(project);
  const previous = new Map((before ?? []).map((config) => [config.environment, config]));
  const lifted: string[] = [];

  for (const env of envs) {
    // State unknown → lift anyway: a guard we missed fails silently, a lifted one is easy to spot.
    if (before === null || previous.get(env)?.changeRequestEnabled === true) {
      await setChangeRequests(project, env, false);
      lifted.push(env);
    }
  }
  if (lifted.length > 0) console.log(`  change requests lifted on ${lifted.join(', ')} while changing flags`);

  try {
    return await mutate();
  } finally {
    for (const env of lifted) {
      const config = previous.get(env);
      if (config?.changeRequestEnabled === true) {
        await setChangeRequests(project, env, true, config.requiredApprovals ?? 1);
        console.log(`  change requests restored on ${env}`);
      }
    }
  }
};
