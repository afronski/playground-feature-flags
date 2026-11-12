/**
 * Single source of truth for the demo's flag model. The provisioning script writes exactly this
 * into Unleash, and the app reads the same names, so the two never drift apart.
 *
 * Every variant carries a JSON payload. The app reads `color` and `label` from it to paint the
 * grid cells, so changing a payload in the Unleash UI changes the grid too.
 */

export const ENVIRONMENTS = ['development', 'production'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const FLAGS = {
  // Numbered so they sort in the order the demo presents them: rollout, then the parent, then its children.
  rollout: '1-rollout',
  allocation: '2-allocation',
  experimentA: '3-experiment-a',
  experimentB: '4-experiment-b',
} as const;

/**
 * Holdout group (use case 3). The app puts `holdout: "true"` in the context of every user on the
 * data team's holdout list (config/holdout.json). The segment below sits on EVERY strategy of
 * EVERY flag and lets a user through only when `holdout` is not "true", so the holdout group gets
 * no rollout, no slot and no experiment, whatever the percentages say.
 */
export const HOLDOUT = {
  contextField: 'holdout',
  segment: 'exclude-holdout-group',
  description: 'Matches everyone EXCEPT users whose context has holdout=true. Attach to every strategy.',
} as const;

export interface VariantPayload {
  [key: string]: string;
  color: string;
  label: string;
}

export interface VariantSpec {
  name: string;
  weight: number; // out of 1000
  payload: VariantPayload;
}

export interface FlagSpec {
  name: string;
  type: 'release' | 'experiment';
  description: string;
  rollout: number; // percentage for the flexibleRollout strategy
  variants: VariantSpec[];
  dependsOn?: { feature: string; variants: string[] };
  /** On/off after provisioning. Every flag starts off: the demo turns them on live. */
  enabledIn: Record<Environment, boolean>;
}

// Control is the light shade, treatment the strong shade of the same hue.
const groups = (experiment: string, control: string, treatment: string): VariantSpec[] => [
  {
    name: 'control',
    weight: 500,
    payload: { experiment, group: 'control', color: control, label: 'Control' },
  },
  {
    name: 'treatment',
    weight: 500,
    payload: { experiment, group: 'treatment', color: treatment, label: 'Treatment' },
  },
];

export const FLAG_SPECS: FlagSpec[] = [
  {
    name: FLAGS.rollout,
    type: 'release',
    description:
      'Use case 1: gradual rollout to 20% of users; inside that 20%, a 50/50 control/treatment split. The other 80% are untouched.',
    rollout: 20,
    variants: groups(FLAGS.rollout, '#A5D9C3', '#1E9A6A'),
    enabledIn: { development: false, production: false },
  },
  {
    name: FLAGS.allocation,
    type: 'experiment',
    description:
      'Use cases 2 and 3: parent flag that puts every user in exactly one slot. Never change the weights while experiments run; rename "free" to add an experiment, retire a finished one into holdout or free.',
    rollout: 100,
    variants: [
      { name: 'holdout', weight: 200, payload: { slot: 'holdout', color: '#1A4049', label: 'Holdout slot' } },
      { name: 'exp-a', weight: 200, payload: { slot: 'exp-a', color: '#8F8AEC', label: 'Slot A' } },
      { name: 'exp-b', weight: 200, payload: { slot: 'exp-b', color: '#D46BAE', label: 'Slot B' } },
      { name: 'free', weight: 400, payload: { slot: 'free', color: '#E9EFEF', label: 'Free' } },
    ],
    enabledIn: { development: false, production: false },
  },
  {
    name: FLAGS.experimentA,
    type: 'experiment',
    description: `Use case 2: experiment A, child of "${FLAGS.allocation}" (slot exp-a only).`,
    rollout: 100,
    variants: groups(FLAGS.experimentA, '#C9C6F7', '#6C65E5'),
    dependsOn: { feature: FLAGS.allocation, variants: ['exp-a'] },
    enabledIn: { development: false, production: false },
  },
  {
    name: FLAGS.experimentB,
    type: 'experiment',
    description:
      `Use case 2: experiment B, child of "${FLAGS.allocation}" (slot exp-b only). Launching it in production is the four-eyes demo.`,
    rollout: 100,
    variants: groups(FLAGS.experimentB, '#EDB9D9', '#C0398F'),
    dependsOn: { feature: FLAGS.allocation, variants: ['exp-b'] },
    enabledIn: { development: false, production: false },
  },
];
