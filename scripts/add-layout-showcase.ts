import { parseConfig } from "../src/shared/config";
import { withShowcase } from "./showcase";

// Explicitly invoked helper: append a showcase while preserving existing content.
const baseUrl = process.env.CHROMA_URL ?? "http://127.0.0.1:3000";
const response = await fetch(`${baseUrl}/api/config`);
if (!response.ok) throw new Error(`Load failed: ${response.status}`);
const config = parseConfig(await response.json());
const next = withShowcase(config);
if (next === config) console.info("Style studio already exists; no changes made.");
else {
  const saved = await fetch(`${baseUrl}/api/config`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next)
  });
  if (!saved.ok) throw new Error(`Save failed: ${saved.status}`);
  console.info("Added Style studio. Previous configuration backed up by the server.");
}
