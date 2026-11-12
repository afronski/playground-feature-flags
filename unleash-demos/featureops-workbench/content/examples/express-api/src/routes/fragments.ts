import { Router } from "express";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

export const router = Router();

const FRAGMENTS_DIR = join(import.meta.dirname, "../fragments");

router.get("/:name", (req, res) => {
  const filePath = join(FRAGMENTS_DIR, `${req.params.name}.ts`);
  try {
    const content = readFileSync(filePath, "utf-8");
    res.type("text/plain").send(content);
  } catch {
    res.status(404).send("Fragment not found");
  }
});

router.put("/:name", (req, res) => {
  const name = req.params.name;
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    res.status(400).send("Invalid fragment name");
    return;
  }
  let body = "";
  req.setEncoding("utf-8");
  req.on("data", (chunk: string) => (body += chunk));
  req.on("end", () => {
    const filePath = join(FRAGMENTS_DIR, `${name}.ts`);
    writeFileSync(filePath, body, "utf-8");
    res.send("Fragment applied. Server restarting.");
  });
});
