import { z } from "zod";
import { iconReferenceSchema, parseConfig, type ChromaConfig, type IconReference } from "./config";
import { createTab } from "./operations";

// The original document keeps its stable, backwards-compatible identifier.
export const profileIdSchema = z.union([z.literal("default"), z.string().uuid()]);
export const profileSchema = z.object({ id: profileIdSchema, name: z.string().min(1).max(120), icon: iconReferenceSchema.optional() });
export const profilesSchema = z.array(profileSchema);
export const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  icon: iconReferenceSchema.optional(),
  sourceProfileId: profileIdSchema.optional()
});
export type Profile = z.infer<typeof profileSchema>;
export type CreateProfile = z.infer<typeof createProfileSchema>;
export const DEFAULT_PROFILE_ICON: IconReference = { type: "iconify", value: "lucide:user-round" };

export function createEmptyHomepage(name: string): ChromaConfig {
  const tab = createTab();
  tab.label = "Home";
  tab.icon = "lucide:house";
  tab.sections[0].title = "Links";
  return parseConfig({
    schemaVersion: 1,
    homepage: { title: name, defaultTabId: tab.id },
    theme: {
      mode: "dark", background: { type: "gradient" },
      glass: { opacity: 0.55, blur: 18, borderOpacity: 0.15 }
    },
    tabs: [tab]
  });
}
