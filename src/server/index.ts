import path from "node:path";
import { existsSync } from "node:fs";
import { createApp } from "./app";

const root = process.cwd();
const production = process.env.NODE_ENV === "production";
const dataPath = process.env.DATA_DIR ?? (production ? "/data" : path.join(root, ".data"));
const defaultConfigPath = process.env.DEFAULT_CONFIG_PATH ?? path.join(root, "config", "default-config.json");
const clientPath = path.join(root, "dist", "client");
const port = Number(process.env.PORT ?? (production ? 3000 : 3001));

const app = await createApp({ dataPath, defaultConfigPath, clientPath: existsSync(clientPath) ? clientPath : undefined });
await app.listen({ host: "0.0.0.0", port });
