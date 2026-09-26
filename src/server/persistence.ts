import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { migrateConfig } from "../shared/migrations";
import { parseConfig, type ChromaConfig } from "../shared/config";
import { profileIdSchema } from "../shared/profiles";

export class ConfigRepository {
  readonly configPath: string;
  readonly assetsPath: string;
  readonly backupsPath: string;

  constructor(private readonly dataPath: string, private readonly defaultConfigPath: string, profileId = "default") {
    profileIdSchema.parse(profileId);
    this.configPath = profileId === "default" ? path.join(dataPath, "config.json") : path.join(dataPath, "profiles", `${profileId}.json`);
    this.assetsPath = path.join(dataPath, "assets");
    this.backupsPath = profileId === "default" ? path.join(dataPath, "backups") : path.join(dataPath, "backups", profileId);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.dataPath, { recursive: true }),
      mkdir(this.assetsPath, { recursive: true }),
      mkdir(this.backupsPath, { recursive: true })
    ]);
    try {
      await this.read();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const initial = migrateConfig(JSON.parse(await readFile(this.defaultConfigPath, "utf8")));
      await this.write(initial, false);
    }
  }

  async read(): Promise<ChromaConfig> {
    return migrateConfig(JSON.parse(await readFile(this.configPath, "utf8")));
  }

  async write(input: unknown, createBackup = true): Promise<ChromaConfig> {
    const config = parseConfig(input);
    const directory = path.dirname(this.configPath);
    await Promise.all([mkdir(directory, { recursive: true }), mkdir(this.backupsPath, { recursive: true })]);
    const temporaryPath = path.join(directory, `.config-${crypto.randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      if (createBackup) {
        try {
          const stamp = new Date().toISOString().replaceAll(":", "-");
          await copyFile(this.configPath, path.join(this.backupsPath, `config-${stamp}-${crypto.randomUUID()}.json`));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      await rename(temporaryPath, this.configPath);
    } finally {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
    return config;
  }
}
