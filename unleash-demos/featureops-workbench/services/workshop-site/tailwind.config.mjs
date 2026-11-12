import starlightPlugin from "@astrojs/starlight-tailwind";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
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
          200: "var(--color-accent)",
          600: "var(--color-accent)",
          900: "var(--color-accent-hover)",
          950: "var(--color-accent-hover)",
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
        warning: "var(--color-warning)",
        error: "var(--color-error)",
        gray: {
          50: "#F4F5F6",
          100: "#E8ECEE",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1A2C31",
          900: "#162226",
          950: "#0F1A1D",
        },
      },
      fontFamily: {
        sans: ["Sen", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [starlightPlugin()],
};
