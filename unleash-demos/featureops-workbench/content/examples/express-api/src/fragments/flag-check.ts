import type { Unleash } from "unleash-client";

export function checkFlag(unleash: Unleash) {
  return { enabled: unleash.isEnabled("lightbulb-colour") };
}
