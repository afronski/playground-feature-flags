/**
 * Expected share per legend entry, worked out from the live rules (no SDK, no token: pure maths).
 * The demo UI feeds it the flag config it reads from the Admin API, so the `(exp. …)` numbers
 * follow any change made in Unleash: rollout %, variant weights, extra strategies.
 *
 * Shares cover the users OUTSIDE the holdout group: the page counts the holdout group itself, from
 * the Playground verdicts. Keys match the `legend` values that src/scenarios.ts gives each cell.
 *
 * How several strategies combine: Unleash takes the first strategy that lets a user in, and uses
 * that strategy's variants. Strategies with the same groupId (and stickiness) hash a user to the
 * same number, so their rollouts nest; strategies with different groupIds hash independently.
 * A strategy with constraints, or a segment other than the holdout segment, depends on who the
 * user is, so it is left out of the maths and listed in `notes` instead.
 */
import { FLAGS, HOLDOUT } from './flags.ts';
import { LEGEND, NEUTRAL, WAITING, short } from './scenarios.ts';

export interface Constraint {
  contextName: string;
  operator: string;
  values?: string[];
  value?: string;
  inverted?: boolean;
  caseInsensitive?: boolean;
}
export interface SegmentRule {
  id: number;
  name: string;
  constraints: Constraint[];
}
export interface VariantRule {
  name: string;
  weight: number;
  stickiness?: string;
  label: string;
  color?: string;
  payload?: unknown;
}
export interface StrategyRule {
  id?: string;
  name: string;
  title?: string;
  disabled: boolean;
  /** 0..100; 100 for strategies without a rollout parameter (e.g. "default"). */
  rollout: number;
  groupId: string;
  stickiness: string;
  constraints: Constraint[];
  segments: SegmentRule[];
  variants: VariantRule[];
}
export interface FlagRule {
  name: string;
  environment: string;
  /** Flag on in this environment. */
  enabled: boolean;
  strategies: StrategyRule[];
  /** Flag-level variants: used by strategies that have none of their own. */
  variants: VariantRule[];
  dependencies: { feature: string; variants?: string[]; enabled?: boolean }[];
}

export type ExpectedShares = Record<string, { share: number; color: string }>;
export interface Expected {
  shares: ExpectedShares;
  notes: string[];
}

/** True when a strategy lets in a share of users we can compute without knowing who they are. */
export const isConditional = (s: StrategyRule): boolean =>
  s.constraints.length > 0 || s.segments.some((segment) => segment.name !== HOLDOUT.segment);

interface Outcome {
  /** Variant name, or '' when the strategy has no variants (flag on, no variant). */
  name: string;
  label: string;
  color?: string;
  share: number;
}
interface FlagOutcomes {
  on: Outcome[];
  /** Share that no strategy lets in. */
  off: number;
}

/** What share of eligible users ends up with which variant of one flag. */
const outcomes = (flag: FlagRule | undefined, notes: string[]): FlagOutcomes | null => {
  if (!flag?.enabled) return null;
  const maxByGroup = new Map<string, number>(); // rollout already covered per hash group, 0..1
  const on: Outcome[] = [];
  let conditional = 0;

  for (const s of flag.strategies) {
    if (s.disabled) continue;
    if (isConditional(s)) {
      conditional += 1;
      continue;
    }
    const group = `${s.groupId}|${s.stickiness}`;
    const before = maxByGroup.get(group) ?? 0;
    const after = Math.max(before, Math.min(Math.max(s.rollout, 0), 100) / 100);
    // Users not caught by any OTHER hash group, times the slice of this group that is new.
    let othersMiss = 1;
    for (const [g, r] of maxByGroup) if (g !== group) othersMiss *= 1 - r;
    const reach = othersMiss * (after - before);
    maxByGroup.set(group, after);
    if (reach <= 0) continue;

    const variants = s.variants.length > 0 ? s.variants : flag.variants;
    const total = variants.reduce((sum, v) => sum + Math.max(v.weight, 0), 0);
    if (total <= 0) on.push({ name: '', label: '—', share: reach });
    else for (const v of variants) if (v.weight > 0) on.push({ name: v.name, label: v.label, color: v.color, share: (reach * v.weight) / total });
  }

  if (conditional > 0) notes.push(`${flag.name}: ${conditional} strategy(ies) with constraints or other segments left out of the expected counts`);
  let miss = 1;
  for (const r of maxByGroup.values()) miss *= 1 - r;
  return { on, off: miss };
};

const SLOT_CHILD: Record<string, string> = { 'exp-a': FLAGS.experimentA, 'exp-b': FLAGS.experimentB };

export const expectedShares = (tab: number, rules: Record<string, FlagRule>): Expected => {
  const shares: ExpectedShares = {};
  const notes: string[] = [];
  const add = (key: string, share: number, color: string): void => {
    if (share <= 1e-9) return;
    shares[key] = { share: (shares[key]?.share ?? 0) + share, color: shares[key]?.color ?? color };
  };

  if (tab === 3) return { shares: { [LEGEND.eligible]: { share: 1, color: NEUTRAL } }, notes };

  if (tab === 1) {
    const r = outcomes(rules[FLAGS.rollout], notes);
    if (!r) return { shares: { [LEGEND.untouched]: { share: 1, color: NEUTRAL } }, notes };
    add(LEGEND.untouched, r.off, NEUTRAL);
    for (const v of r.on) add(`Rollout · ${v.label}`, v.share, v.color ?? NEUTRAL);
    return { shares, notes };
  }

  // Tabs 2 and 4: slot from the parent, then the child flag that depends on that slot.
  const allocation = outcomes(rules[FLAGS.allocation], notes);
  if (!allocation) return { shares: { [LEGEND.noSlot]: { share: 1, color: NEUTRAL } }, notes };
  add(LEGEND.noSlot, allocation.off, NEUTRAL); // flag on but the user outside every strategy
  for (const slot of allocation.on) {
    const childFlag = SLOT_CHILD[slot.name];
    if (!childFlag) {
      add(slot.label, slot.share, slot.color ?? NEUTRAL);
      continue;
    }
    const child = outcomes(rules[childFlag], notes);
    if (!child) {
      add(`${slot.label} · not launched`, slot.share, WAITING);
      continue;
    }
    for (const v of child.on) add(`${short(childFlag)} · ${v.label}`, slot.share * v.share, v.color ?? NEUTRAL);
    add(`${slot.label} · not launched`, slot.share * child.off, WAITING);
  }
  return { shares, notes };
};
