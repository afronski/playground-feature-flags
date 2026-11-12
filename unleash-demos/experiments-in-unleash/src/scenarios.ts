/**
 * What one grid cell (one user) shows for each tab. All flag evaluation happens here, on the
 * back-end; the browser only gets the result.
 *
 *   tab 1  development  1-rollout                         20% rollout, 50/50 inside
 *   tab 2  development  2-allocation → 3-experiment-a / 4-experiment-b   one experiment per user, holdout slot
 *   tab 3  development  holdout context field + segment  holdout group gets every flag off
 *   tab 4  production   same as tab 2, behind change requests (four-eyes)
 *
 * Users in the holdout group (holdout=true in their context) look the same on every tab: the
 * cell still evaluates all four flags and shows that each one is off for them.
 */
import type { Context, Unleash } from 'unleash-client';
import { FLAGS, HOLDOUT, type Environment } from './flags.ts';

export type Tab = 1 | 2 | 3 | 4;

export const TAB_ENVIRONMENT: Record<Tab, Environment> = { 1: 'development', 2: 'development', 3: 'development', 4: 'production' };

export interface CellResult {
  color: string;
  /** Short legend key, counted by the page. */
  legend: string;
  headline: string;
  rows: [string, string][];
  payload?: unknown;
  alert?: string;
}

interface Evaluated {
  flag: string;
  enabled: boolean;
  variant: string;
  payload: Record<string, string> | undefined;
}

// Colours from the Enterprise FeatureOps palette; flag colours come from variant payloads.
export const NEUTRAL = '#F3F6F6';
export const WAITING = '#ECD875';
const ALERT = '#C0392B';
const IN_EXPERIMENT = '#C9C6F7';
const HOLDOUT_GROUP = '#D9662A';
export const HOLDOUT_GROUP_LEGEND = 'Holdout group';
/** Legend keys shared with src/expected.ts. */
export const LEGEND = { untouched: 'Untouched', eligible: 'Eligible', noSlot: 'No slot' } as const;

/** The Unleash context for one user; `holdout` is a custom context field. */
export const userContext = (userId: string, holdout: boolean): Context => ({
  userId,
  sessionId: userId,
  properties: { [HOLDOUT.contextField]: String(holdout) },
});

const evaluate = (unleash: Unleash, flag: string, context: Context): Evaluated => {
  const variant = unleash.getVariant(flag, context);
  let payload: Record<string, string> | undefined;
  if (variant.payload?.type === 'json') {
    try {
      payload = JSON.parse(variant.payload.value) as Record<string, string>;
    } catch {
      payload = undefined;
    }
  }
  return { flag, enabled: variant.feature_enabled ?? variant.enabled, variant: variant.enabled ? variant.name : '—', payload };
};

export const short = (flag: string): string => (flag === FLAGS.experimentA ? 'Exp A' : 'Exp B');
const ALL_FLAGS = [FLAGS.rollout, FLAGS.allocation, FLAGS.experimentA, FLAGS.experimentB];

/** Holdout group: evaluate every flag anyway, to show the segment keeps each one off. */
const holdoutGroup = (unleash: Unleash, context: Context): CellResult => {
  const results = ALL_FLAGS.map((flag) => evaluate(unleash, flag, context));
  const leaked = results.filter((r) => r.enabled);
  return {
    color: leaked.length ? ALERT : HOLDOUT_GROUP,
    legend: leaked.length ? 'Holdout group LEAK' : HOLDOUT_GROUP_LEGEND,
    headline: HOLDOUT_GROUP_LEGEND,
    rows: results.map((r) => [r.flag, r.enabled ? r.variant : 'off']),
    alert: leaked.length ? `On despite holdout: ${leaked.map((r) => r.flag).join(', ')} (segment missing?)` : undefined,
  };
};

const rollout = (unleash: Unleash, context: Context): CellResult => {
  const r = evaluate(unleash, FLAGS.rollout, context);
  if (!r.enabled) {
    return { color: NEUTRAL, legend: LEGEND.untouched, headline: 'Untouched', rows: [[r.flag, 'off']] };
  }
  return {
    color: r.payload?.color ?? NEUTRAL,
    legend: `Rollout · ${r.payload?.label ?? r.variant}`,
    headline: r.payload?.label ?? r.variant,
    rows: [[r.flag, r.variant]],
    payload: r.payload,
  };
};

const experiments = (unleash: Unleash, context: Context, env: Environment): CellResult => {
  const slot = evaluate(unleash, FLAGS.allocation, context);
  const a = evaluate(unleash, FLAGS.experimentA, context);
  const b = evaluate(unleash, FLAGS.experimentB, context);
  const active = [a, b].filter((e) => e.enabled);
  const rows: [string, string][] = [
    [FLAGS.allocation, slot.enabled ? slot.variant : 'off'],
    [FLAGS.experimentA, a.enabled ? a.variant : '—'],
    [FLAGS.experimentB, b.enabled ? b.variant : '—'],
  ];

  if (active.length > 1) {
    return { color: ALERT, legend: 'OVERLAP (must never happen)', headline: 'OVERLAP', rows, alert: 'User is in more than one experiment' };
  }
  if (active.length === 1) {
    const [exp] = active;
    return {
      color: exp.payload?.color ?? NEUTRAL,
      legend: `${short(exp.flag)} · ${exp.payload?.label ?? exp.variant}`,
      headline: `${short(exp.flag)} · ${exp.payload?.label ?? exp.variant}`,
      rows,
      payload: exp.payload,
    };
  }

  // In no experiment: say why.
  if (!slot.enabled) {
    return { color: NEUTRAL, legend: LEGEND.noSlot, headline: `No slot · ${FLAGS.allocation} off`, rows };
  }
  const slotLabel = slot.payload?.label ?? slot.variant;
  if (slot.variant === 'exp-a' || slot.variant === 'exp-b') {
    const waiting = env === 'production' ? ' · awaiting approval' : ' · experiment off';
    // No payload here: the two-line headline needs the room.
    return { color: WAITING, legend: `${slotLabel} · not launched`, headline: `${slotLabel}${waiting}`, rows };
  }
  return {
    color: slot.payload?.color ?? NEUTRAL,
    legend: slotLabel,
    headline: slot.variant === 'free' ? 'Free slot' : slotLabel,
    rows,
    payload: slot.payload,
  };
};

/** Tab 3, users outside the holdout group: show what they are eligible for and got. */
const eligible = (unleash: Unleash, context: Context): CellResult => {
  const results = ALL_FLAGS.map((flag) => evaluate(unleash, flag, context));
  return {
    color: NEUTRAL,
    legend: LEGEND.eligible,
    headline: 'Eligible',
    rows: results.map((r) => [r.flag, r.enabled ? r.variant : 'off']),
  };
};

export const evaluateCell = (tab: Tab, unleash: Unleash, userId: string, holdout: boolean): CellResult => {
  const context = userContext(userId, holdout);
  if (holdout) return holdoutGroup(unleash, context);
  switch (tab) {
    case 1:
      return rollout(unleash, context);
    case 2:
      return experiments(unleash, context, 'development');
    case 3:
      return eligible(unleash, context);
    case 4:
      return experiments(unleash, context, 'production');
  }
};

export const HOLDOUT_GROUP_COLOR = HOLDOUT_GROUP;
