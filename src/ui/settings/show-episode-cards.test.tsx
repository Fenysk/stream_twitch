import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConfirmedSummary } from "../../domain/clip.schema";
import type { EditableSettings } from "../../domain/settings.schema";
import { IDLE_SHOW, type ShowState } from "../../domain/show.schema";
import { EndSceneChoice, EpisodeCards } from "./show-episode-cards";
import { SHOW_CLIP_COUNT_SLIDER, SHOW_LISTS } from "./show-fields";
import type { UseScenes } from "./use-scenes";
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

// Les scènes d'OBS lues, dans son ordre.
const SCENES: UseScenes = { scenes: ["Jeu", "Pause", "Fin"], error: null };

const render = (
  state: ShowState,
  effective: Partial<EditableSettings> | null,
  confirmed: readonly ConfirmedSummary[] | null = null,
  drafts: UseSettings["drafts"] = {},
  scenes: UseScenes = SCENES,
): string =>
  renderToStaticMarkup(
    createElement(EpisodeCards, { state, settings: settings(effective, drafts), confirmed, scenes }),
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
    {
      name: "a.mp4",
      title: "A",
      version: "1-1",
      day: "2026-10-16",
      durationMs: 10_000,
      laughs: [],
      hasEndPhrase: false,
    },
    {
      name: "b.mp4",
      title: "B",
      version: "1-1",
      day: "2026-10-16",
      durationMs: 10_000,
      laughs: [],
      hasEndPhrase: false,
    },
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
  // Un clip pèse 6000 de carton plus sa partie gardée (plus 6000 de phrase de fin s'il en a une) ; l'ouverture et la clôture 12 400.
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

  it("Quand un clip a une phrase de fin, le système doit la compter, et rien pour des rires sans phrase de fin ni pour une phrase vide ou blanche", () => {
    // 126,6 s gardées : 12 400 + 6000 + 126 600 = 145 000 ms sans phrase de fin (2 min), 151 000 avec (3 min).
    const laugh = (at: number) => ({ laughs: [{ at, sound: "rires001" }] });
    const render126 = (clip: ConfirmedSummary) => render(IDLE_SHOW, { showClipCount: 1 }, [clip]);
    expect(render126(confirmedClip("a.mp4", { end: 126.6 }))).toContain("Durée estimée : 2 min");
    expect(render126(confirmedClip("a.mp4", { end: 126.6, endPhrase: "Bien joué." }))).toContain(
      "Durée estimée : 3 min",
    );
    expect(render126(confirmedClip("a.mp4", { end: 126.6, ...laugh(20) }))).toContain(
      "Durée estimée : 2 min",
    );
    expect(
      render126(confirmedClip("a.mp4", { start: 10, end: 136.6, ...laugh(5), endPhrase: "   " })),
    ).toContain("Durée estimée : 2 min");
    expect(render126(confirmedClip("a.mp4", { end: 126.6, ...laugh(20), endPhrase: "" }))).toContain(
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

describe("la scène après l'émission", () => {
  const renderScenes = (effective: Partial<EditableSettings> | null, scenes: UseScenes = SCENES): string =>
    render(IDLE_SHOW, effective, null, {}, scenes);
  const radios = (html: string): string[] =>
    [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map(([input]) => input);
  const isChecked = (input: string): boolean => input.includes('checked=""');
  const toValue = (input: string): string | undefined => /value="([^"]*)"/.exec(input)?.[1];
  const chosen = (html: string): (string | undefined)[] => radios(html).filter(isChecked).map(toValue);

  it("Quand les scènes d'OBS sont lues, le système doit proposer d'abord « Rester sur la scène de l'émission », puis chaque scène dans l'ordre d'OBS", () => {
    const html = renderScenes({});
    expect(html).toContain("Scène après l&#x27;émission");
    expect(radios(html).map(toValue)).toEqual(["", "Jeu", "Pause", "Fin"]);
    const positions = ["Rester sur la scène de l&#x27;émission", "Jeu", "Pause", "Fin"].map((label) =>
      html.indexOf(`>${label}<`),
    );
    expect(positions.every((position) => position > -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("Quand le choix s'affiche, le système doit le placer sous la durée estimée, dans la carte Émission", () => {
    const html = render(IDLE_SHOW, { showClipCount: 2 }, [confirmedClip("a.mp4")]);
    expect(html.indexOf("Durée estimée")).toBeGreaterThan(-1);
    expect(html.indexOf("Durée estimée")).toBeLessThan(html.indexOf("Scène après l&#x27;émission"));
    expect(html.indexOf("Scène après l&#x27;émission")).toBeLessThan(html.indexOf("Phrases de Jean-Renard"));
  });

  it("Quand aucune scène n'est enregistrée, ou une scène vide, le système doit cocher « Rester » seul", () => {
    expect(chosen(renderScenes({}))).toEqual([""]);
    expect(chosen(renderScenes({ showEndScene: "" }))).toEqual([""]);
  });

  it("Quand la scène enregistrée est dans la liste, le système doit cocher cette scène seule, sans la dire absente", () => {
    const html = renderScenes({ showEndScene: "Pause" });
    expect(chosen(html)).toEqual(["Pause"]);
    expect(radios(html)).toHaveLength(4);
    expect(html).not.toContain("absente d");
  });

  it("Quand la scène enregistrée n'est plus dans OBS, le système doit la garder cochée en fin de liste avec la note « absente d'OBS »", () => {
    const html = renderScenes({ showEndScene: "Ancienne" });
    expect(radios(html).map(toValue)).toEqual(["", "Jeu", "Pause", "Fin", "Ancienne"]);
    expect(chosen(html)).toEqual(["Ancienne"]);
    expect(html).toContain("absente d&#x27;OBS");
  });

  it("Quand les scènes se lisent encore, le système doit afficher le texte de chargement à la place du choix", () => {
    const html = renderScenes({}, { scenes: null, error: null });
    expect(html).toContain("Chargement…");
    expect(radios(html)).toHaveLength(0);
    expect(html).not.toContain("Scène après l&#x27;émission");
  });

  it("Quand OBS ne répond pas, le système doit le dire sur une ligne et garder « Rester » et la scène enregistrée, sans la dire absente", () => {
    const html = renderScenes({ showEndScene: "Pause" }, { scenes: null, error: "OBS n'est pas connecté" });
    expect(html).toContain("Les scènes d&#x27;OBS sont illisibles : OBS n&#x27;est pas connecté.");
    expect(radios(html).map(toValue)).toEqual(["", "Pause"]);
    expect(chosen(html)).toEqual(["Pause"]);
    expect(html).not.toContain("absente d");
  });

  it("Quand OBS ne répond pas et qu'aucune scène n'est enregistrée, le système doit proposer « Rester » seul, coché", () => {
    const html = renderScenes({}, { scenes: null, error: "le serveur ne répond pas" });
    expect(radios(html).map(toValue)).toEqual([""]);
    expect(chosen(html)).toEqual([""]);
  });

  it("Quand le choix s'affiche, le système doit expliquer que la bascule suit une fin normale, pas une coupure", () => {
    expect(renderScenes({})).toContain(
      "OBS y passe tout seul quand l&#x27;émission finit normalement, pas quand tu la coupes.",
    );
  });

  it("Quand les réglages ne sont pas lus, le système ne doit montrer aucun choix de scène", () => {
    const html = renderScenes(null);
    expect(html).toContain("Chargement…");
    expect(html).not.toContain("Scène après");
  });

  describe("un clic sur une option", () => {
    type Selectable = { children?: ReactNode; onSelect?: (value: string) => void };
    const findOnSelect = (node: ReactNode): ((value: string) => void) | undefined => {
      if (!isValidElement<Selectable>(node)) return undefined;
      if (node.props.onSelect) return node.props.onSelect;
      for (const child of Children.toArray(node.props.children)) {
        const found = findOnSelect(child);
        if (found) return found;
      }
      return undefined;
    };
    const click = (value: string): Partial<EditableSettings>[] => {
      const changed: Partial<EditableSettings>[] = [];
      const element = EndSceneChoice({
        scenes: SCENES,
        settings: {
          ...settings({ showEndScene: "Jeu" }),
          change: async (changes) => {
            changed.push(changes);
            return true;
          },
        },
        effective: { threshold: -40, showEndScene: "Jeu" },
      });
      findOnSelect(element)?.(value);
      return changed;
    };

    it("Quand on choisit une scène, le système doit enregistrer son nom dans showEndScene", () => {
      expect(click("Pause")).toEqual([{ showEndScene: "Pause" }]);
    });

    it("Quand on choisit « Rester », le système doit enregistrer une scène vide", () => {
      expect(click("")).toEqual([{ showEndScene: "" }]);
    });
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
