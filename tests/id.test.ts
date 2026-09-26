import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../src/shared/id";
import { createLinkCard, createTab, duplicateCard, pasteCard } from "../src/shared/operations";
import { fixtureConfig } from "./fixtures";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("document IDs", () => {
  it("uses native randomUUID when available", () => {
    const native = vi.spyOn(globalThis.crypto, "randomUUID");
    expect(createId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(native).toHaveBeenCalledOnce();
  });

  it("creates unique UUID v4 IDs using secure random bytes on HTTP LAN origins", () => {
    const random = vi.fn(globalThis.crypto.getRandomValues.bind(globalThis.crypto));
    vi.stubGlobal("crypto", { getRandomValues: random });
    const ids = Array.from({ length: 1000 }, createId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(random).toHaveBeenCalledTimes(ids.length);
    const card = createLinkCard();
    expect(createTab().sections).toHaveLength(1);
    const config = fixtureConfig();
    expect(duplicateCard(config, "card-a").tabs[0].sections[0].cards).toHaveLength(2);
    expect(pasteCard(config, card, "tab-b", "section-c").tabs[1].sections[0].cards[0].id).not.toBe(card.id);
  });
});
