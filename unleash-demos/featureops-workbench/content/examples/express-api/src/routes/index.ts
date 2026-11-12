import { Router } from "express";
import type { Unleash } from "unleash-client";

export const router = Router();

router.get("/", async (req, res) => {
  const unleash: Unleash | null = req.app.locals.unleash;

  if (!unleash) {
    res.json({ enabled: false, error: "No API token configured. Paste your token into the Secret Vault." });
    return;
  }

  // Dynamic import so nodemon restarts pick up edited fragments
  const { checkFlag } = await import("../fragments/flag-check.js");
  const result = checkFlag(unleash);

  res.json(result);
});
