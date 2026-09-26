import { parseConfig, type ChromaConfig } from "./config";

export const CURRENT_SCHEMA_VERSION = 1;
type Migration = (document: Record<string, unknown>) => Record<string, unknown>;

const migrations: Record<number, Migration> = {};

export function migrateConfig(input: unknown): ChromaConfig {
  if (!input || typeof input !== "object") throw new Error("Configuration must be an object");
  let document = structuredClone(input) as Record<string, unknown>;
  let version = Number(document.schemaVersion ?? 0);
  if (!Number.isInteger(version) || version < 1) throw new Error("Unsupported or missing schemaVersion");
  if (version > CURRENT_SCHEMA_VERSION) throw new Error(`Configuration schema ${version} is newer than supported schema ${CURRENT_SCHEMA_VERSION}`);
  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = migrations[version];
    if (!migration) throw new Error(`No migration exists from schema version ${version}`);
    document = migration(document);
    version += 1;
    document.schemaVersion = version;
  }
  return parseConfig(document);
}

export function registeredMigrationVersions(): number[] {
  return Object.keys(migrations).map(Number).sort((a, b) => a - b);
}
