import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EditableSettings } from "../../domain/settings.schema";
import { IDLE_SHOW, type ShowState } from "../../domain/show.schema";
import { EpisodeCards } from "./show-episode-cards";
import { SHOW_CLIP_COUNT_SLIDER, SHOW_LISTS } from "./show-fields";
import type { UseSettings } from "./use-settings";

const settings = (effective: Partial<EditableSettings> | null): UseSettings => ({
  view: effective && {
    defaults: { threshold: -40 },
    local: {},
    effective: { threshold: -40, ...effective },
  },
  drafts: {},
  errors: { byKey: {}, general: [] },
  edit: () => undefined,
  choose: async () => undefined,
  change: async () => true,
  reset: async () => undefined,
});

const render = (state: ShowState, effective: Partial<EditableSettings> | null): string =>
  renderToStaticMarkup(createElement(EpisodeCards, { state, settings: settings(effective) }));

const running: ShowState = {
  status: "running",
  runId: "run1",
  lineup: [
    { name: "a.mp4", title: "A", version: "1-1", day: "2026-10-16", laughs: [] },
    { name: "b.mp4", title: "B", version: "1-1", day: "2026-10-16", laughs: [] },
  ],
  phase: "clip",
  index: 1,
};

describe("les cartes de l'émission", () => {
  it("disent que l'émission est arrêtée, et le nombre de clips réglé", () => {
    const html = render(IDLE_SHOW, { showClipCount: 8 });
    expect(html).toContain("Émission arrêtée.");
    expect(html).toContain("Clips par émission");
    expect(html).toContain("8");
  });

  it("disent où en est l'émission en cours : « clip 2 sur 2 »", () => {
    expect(render(running, { showClipCount: 5 })).toContain("Émission en cours : clip 2 sur 2.");
  });

  it("annoncent le chargement tant que les réglages ne sont pas là", () => {
    const html = render(IDLE_SHOW, null);
    expect(html).toContain("Chargement…");
    expect(html).not.toContain("Phrases d&#x27;ouverture");
  });

  it("montrent les phrases d'ouverture et de clôture, une par ligne", () => {
    const html = render(IDLE_SHOW, {
      showOpeningPhrases: ["Bonsoir.", "Re-bonsoir."],
      showClosingPhrases: ["Adieu."],
    });
    expect(html).toContain("Phrases d&#x27;ouverture");
    expect(html).toContain("Bonsoir.\nRe-bonsoir.");
    expect(html).toContain("Phrases de clôture");
    expect(html).toContain("Adieu.");
  });
});

describe("les réglages de l'émission", () => {
  it("règlent 1 à 20 clips, 5 par défaut", () => {
    expect(SHOW_CLIP_COUNT_SLIDER.key).toBe("showClipCount");
    expect(SHOW_CLIP_COUNT_SLIDER.fallback).toBe(5);
    expect(SHOW_CLIP_COUNT_SLIDER.steps.map(({ value }) => value)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  it("écrivent les deux listes de phrases dans l'ordre : ouverture, clôture", () => {
    expect(SHOW_LISTS.map(({ key }) => key)).toEqual(["showOpeningPhrases", "showClosingPhrases"]);
  });
});
