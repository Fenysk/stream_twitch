import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConfirmedSummary } from "../../domain/clip.schema";
import type { EditableSettings } from "../../domain/settings.schema";
import { IDLE_SHOW, type ShowState } from "../../domain/show.schema";
import { EpisodeCards } from "./show-episode-cards";
import { SHOW_CLIP_COUNT_SLIDER, SHOW_LISTS } from "./show-fields";
import type { UseSettings } from "./use-settings";

const settings = (
  effective: Partial<EditableSettings> | null,
  drafts: UseSettings["drafts"] = {},
): UseSettings => ({
  view: effective && {
    defaults: { threshold: -40 },
    local: {},
    effective: { threshold: -40, ...effective },
  },
  drafts,
  errors: { byKey: {}, general: [] },
  edit: () => undefined,
  choose: async () => undefined,
  change: async () => true,
  reset: async () => undefined,
});

const render = (
  state: ShowState,
  effective: Partial<EditableSettings> | null,
  confirmed: readonly ConfirmedSummary[] | null = null,
  drafts: UseSettings["drafts"] = {},
): string =>
  renderToStaticMarkup(
    createElement(EpisodeCards, { state, settings: settings(effective, drafts), confirmed }),
  );

// Un clip confirmé dont la partie gardée dure `end - start` secondes.
const confirmedClip = (name: string, overrides: Partial<ConfirmedSummary> = {}): ConfirmedSummary => ({
  name,
  title: name,
  phrase: "",
  start: 0,
  end: 60,
  rawName: name,
  processedName: null,
  confirmedAt: "2026-10-16T10:00:00.000Z",
  version: "1-1",
  ...overrides,
});

const running: ShowState = {
  status: "running",
  runId: "run1",
  lineup: [
    { name: "a.mp4", title: "A", version: "1-1", day: "2026-10-16", durationMs: 10_000, laughs: [] },
    { name: "b.mp4", title: "B", version: "1-1", day: "2026-10-16", durationMs: 10_000, laughs: [] },
  ],
  phase: "clip",
  index: 1,
  startsAt: 0,
  returnAt: 0,
  showFader: 100,
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

  it("montre les phrases de coupure, une par ligne, dans la carte des phrases de Jean-Renard", () => {
    const html = render(IDLE_SHOW, { showGrumblePhrases: ["Hé !", "Rends-moi mon émission."] });
    expect(html).toContain("Phrases si l&#x27;émission est coupée");
    expect(html).toContain("Hé !\nRends-moi mon émission.");
  });
});

describe("la durée estimée sous le nombre de clips", () => {
  // Un clip pèse 6000 de carton plus sa partie gardée (plus 6000 de phrase des rires s'il en a) ; l'ouverture et la clôture 12 400.
  const clips = [
    confirmedClip("a.mp4", { end: 120 }),
    confirmedClip("b.mp4", { end: 60 }),
    confirmedClip("c.mp4", { start: 10, end: 40 }),
  ];

  it("Quand les clips confirmés sont lus, le système doit dire sous le curseur la durée de l'émission : la fourchette du tirage le plus court au plus long", () => {
    // Deux clips parmi trois jamais passés : 36 000 + 66 000 au plus court, 126 000 + 66 000 au plus long.
    const html = render(IDLE_SHOW, { showClipCount: 2 }, clips);
    expect(html).toContain("Durée estimée : 2 à 3 min");
    expect(html.indexOf("Clips par émission")).toBeLessThan(html.indexOf("Durée estimée"));
  });

  it("Quand le curseur bouge, le système doit suivre le geste en cours (le brouillon), pas seulement le réglage enregistré", () => {
    const html = render(IDLE_SHOW, { showClipCount: 2 }, clips, { showClipCount: 3 });
    expect(html).toContain("Durée estimée : 4 min");
    expect(html).not.toContain("2 à 3 min");
  });

  it("Quand le réglage n'a pas de valeur, le système doit compter les 5 clips par défaut", () => {
    expect(render(IDLE_SHOW, {}, clips)).toContain("Durée estimée : 4 min");
  });

  it("Quand un clip a été plus passé que le seuil, le système doit l'écarter du calcul", () => {
    const html = render(IDLE_SHOW, { showClipCount: 1 }, [
      confirmedClip("a.mp4", { end: 60 }),
      confirmedClip("b.mp4", { end: 600, playCount: 5 }),
    ]);
    expect(html).toContain("Durée estimée : 1 min");
  });

  it("Quand un clip a des rires dans sa partie gardée, le système doit compter la phrase des rires, pas ceux d'avant son début", () => {
    // 126,6 s gardées : 12 400 + 6000 + 126 600 = 145 000 ms sans phrase des rires (2 min), 151 000 avec (3 min).
    const laugh = (at: number) => ({ laughs: [{ at, sound: "rires001" }] });
    const render126 = (clip: ConfirmedSummary) => render(IDLE_SHOW, { showClipCount: 1 }, [clip]);
    expect(render126(confirmedClip("a.mp4", { end: 126.6 }))).toContain("Durée estimée : 2 min");
    expect(render126(confirmedClip("a.mp4", { end: 126.6, ...laugh(20) }))).toContain(
      "Durée estimée : 3 min",
    );
    expect(render126(confirmedClip("a.mp4", { start: 10, end: 136.6, ...laugh(5) }))).toContain(
      "Durée estimée : 2 min",
    );
  });

  it("Quand la liste des clips n'est pas encore lue, ou vide, le système doit ne rien estimer", () => {
    expect(render(IDLE_SHOW, { showClipCount: 2 }, null)).not.toContain("Durée estimée");
    expect(render(IDLE_SHOW, { showClipCount: 2 }, [])).not.toContain("Durée estimée");
  });

  it("Quand les réglages ne sont pas là, le système doit ne rien estimer", () => {
    expect(render(IDLE_SHOW, null, clips)).not.toContain("Durée estimée");
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

  it("écrivent les trois listes de phrases dans l'ordre : ouverture, clôture, coupure", () => {
    expect(SHOW_LISTS.map(({ key }) => key)).toEqual([
      "showOpeningPhrases",
      "showClosingPhrases",
      "showGrumblePhrases",
    ]);
  });

  it("décrivent la liste des phrases de coupure : son nom, son aide et ses 4 lignes", () => {
    expect(SHOW_LISTS[2]).toEqual({
      key: "showGrumblePhrases",
      label: "Phrases si l'émission est coupée",
      help: "Une phrase par ligne. Jean-Renard en dit une sur /fox, tourné vers Fenysk, quand l'émission est coupée en cours (la source /show cachée), au hasard, sans répéter avant d'avoir tout dit.",
      rows: 4,
    });
  });
});
