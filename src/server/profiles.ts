import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { createEmptyHomepage, createProfileSchema, profileIdSchema, type Profile } from "../shared/profiles";
import { ConfigRepository } from "./persistence";

export class ProfileRepository {
  constructor(private readonly dataPath: string, private readonly defaultConfigPath: string) {}

  config(id: string): ConfigRepository {
    return new ConfigRepository(this.dataPath, this.defaultConfigPath, profileIdSchema.parse(id));
  }

  async list(): Promise<Profile[]> {
    const directory = path.join(this.dataPath, "profiles");
    await mkdir(directory, { recursive: true });
    const entries = await readdir(directory, { withFileTypes: true });
    const ids = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json") && profileIdSchema.safeParse(entry.name.slice(0, -5)).success && entry.name !== "default.json")
      .map((entry) => entry.name.slice(0, -5)).sort();
    return Promise.all(["default", ...ids].map(async (id) => {
      const { title, icon } = (await this.config(id).read()).homepage;
      return { id, name: title, ...(icon ? { icon } : {}) };
    }));
  }

  async create(input: unknown) {
    const { name, icon, sourceProfileId } = createProfileSchema.parse(input);
    const config = sourceProfileId ? await this.config(sourceProfileId).read() : createEmptyHomepage(name);
    config.homepage.title = name;
    if (icon) config.homepage.icon = icon;
    const id = crypto.randomUUID();
    await this.config(id).write(config, false);
    return { profile: { id, name, ...(config.homepage.icon ? { icon: config.homepage.icon } : {}) }, config };
  }
}
