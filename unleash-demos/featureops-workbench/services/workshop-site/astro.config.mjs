import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: "static",
  image: { service: { entrypoint: "astro/assets/services/noop" } },
  vite: {
    resolve: {
      alias: {
        "@components": path.resolve(__dirname, "src/components"),
      },
    },
  },
  integrations: [
    starlight({
      title: "FeatureOps Workbench",
      customCss: [
        "./src/styles/global.css",
        "@workbench/instruments/styles",
      ],
      head: [
        {
          tag: "script",
          attrs: { src: "/codapi/snippet.js" },
        },
        {
          tag: "link",
          attrs: { rel: "stylesheet", href: "/codapi/snippet.css" },
        },
      ],
      components: {
        Head: "./src/components/CustomHead.astro",
        Header: "./src/components/Header.astro",
        NotFound: "./src/components/NotFound.astro",
        Sidebar: "./src/components/Sidebar.astro",
        PageSidebar: "./src/components/PageSidebar.astro",
        TwoColumnContent: "./src/components/TwoColumnContent.astro",
      },
      sidebar: [
        {
          label: "Chapters",
          items: [
            { label: "1. Introduction", slug: "chapters/01-introduction" },
            { label: "2. Setting Up Unleash", slug: "chapters/02-unleash-setup" },
            { label: "3. First Flag Evaluation", slug: "chapters/03-first-evaluation" },
            { label: "4. Wiring the App", slug: "chapters/04-wiring-the-app" },
          ],
        },
      ],
    }),
    tailwind({ applyBaseStyles: false }),
    react(),
  ],
});
