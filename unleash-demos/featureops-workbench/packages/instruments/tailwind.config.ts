import type { Config } from "tailwindcss";

const config: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--color-brand)",
          light: "var(--color-brand-light)",
          lighter: "var(--color-brand-lighter)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          dim: "var(--color-surface-dim)",
        },
        border: "var(--color-border)",
        "flag-on": "var(--color-flag-on)",
        "flag-off": "var(--color-flag-off)",
        bezel: {
          DEFAULT: "var(--color-bezel)",
          surface: "var(--color-bezel-surface)",
          label: "var(--color-bezel-label)",
        },
        glow: "var(--color-glow)",
        wire: "var(--color-wire)",
      },
      fontFamily: {
        sans: ["Sen", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
};

export default config;
