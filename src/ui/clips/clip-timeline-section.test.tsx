import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SoundSummary } from "../../domain/sound.schema";
import { Slider } from "../design/slider";
import { ClipTimelineSection, NO_SOUND_TEXT } from "./clip-timeline-section";
import type { ClipLaughs } from "./use-clip-laughs";

const sound: SoundSummary = {
  id: "aaaa0001",
  title: "Applaudissements",
  fader: 80,
  version: "1-1",
  rewardTitles: [],
  clipCount: 0,
};

const NO_LAUGHS: ClipLaughs = {
  blocks: [],
  details: null,
  canCreate: true,
  isSoundboardEmpty: false,
  requests: [],
  usedSounds: [],
  seconds: new Map(),
  create: () => undefined,
  choose: () => undefined,
  move: () => undefined,
  update: () => undefined,
  delete: () => undefined,
};

const render = (
  laughs: Partial<ClipLaughs> = {},
  options: { isTrimLocked?: boolean; isWorking?: boolean; laughFader?: number } = {},
) =>
  renderToStaticMarkup(
    <ClipTimelineSection
      duration={118.55}
      trim={{ start: 10, end: 60 }}
      time={25}
      isTrimLocked={options.isTrimLocked ?? false}
      isWorking={options.isWorking ?? false}
      laughs={{ ...NO_LAUGHS, ...laughs }}
      laughFader={options.laughFader ?? 100}
      onLaughFaderChange={() => undefined}
      sounds={[sound]}
      onSeek={() => undefined}
      onStartChange={() => undefined}
      onEndChange={() => undefined}
      onPlayKept={() => undefined}
    />,
  );

// Le bouton qui porte ce libellé est grisé ?
const isGrayed = (html: string, label: string): boolean =>
  new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*${label}`, "s").test(html);

describe("sous le lecteur, la timeline et ses boutons", () => {
  it("pose les pistes Coupe puis Rires sous la règle, avec une seule position de lecture", () => {
    const html = render();
    expect(html.indexOf(">Coupe<")).toBeLessThan(html.indexOf(">Rires<"));
    expect(html.indexOf("timeline-tick")).toBeLessThan(html.indexOf(">Coupe<"));
    expect(html.match(/class="timeline-playhead"/g)).toHaveLength(1);
  });

  it("garde la barre de coupe telle quelle dans la piste Coupe : poignées actives", () => {
    const html = render();
    expect(html.match(/role="slider"/g)).toHaveLength(2);
    expect(html).not.toMatch(/role="slider"[^>]*disabled=""/);
  });

  it("désactive les poignées quand la coupe est verrouillée, mais pas « Rire ici »", () => {
    const html = render({}, { isTrimLocked: true });
    expect(html.match(/role="slider"[^>]*disabled=""|disabled=""[^>]*role="slider"/g)).toHaveLength(2);
    expect(isGrayed(html, "Rire ici")).toBe(false);
  });

  it("met « Rire ici » à côté de « Lire la sélection »", () => {
    const html = render();
    expect(html).toContain("Lire la sélection");
    expect(html).toContain("Rire ici");
    expect(html.indexOf("Lire la sélection")).toBeLessThan(html.indexOf("Rire ici"));
  });

  it("dit le début, la fin et la durée gardée ; verrouillée, seulement la durée", () => {
    expect(render()).toContain("Début 0:10.00 · Fin 1:00.00 · Gardé 0:50.00");
    const locked = render({}, { isTrimLocked: true });
    expect(locked).toContain("Durée 0:50.00");
    expect(locked).not.toContain("Début 0:10.00");
  });
});

describe("« Rire ici » et la soundboard", () => {
  it("est actif quand un sound est disponible, et grisé quand un clip est traité", () => {
    expect(isGrayed(render(), "Rire ici")).toBe(false);
    expect(isGrayed(render({}, { isWorking: true }), "Rire ici")).toBe(true);
  });

  it("est grisé quand aucun sound n'est disponible : soundboard vide ou pas encore lue", () => {
    expect(isGrayed(render({ canCreate: false }), "Rire ici")).toBe(true);
  });

  it("dit pourquoi quand la soundboard est vide, et seulement alors", () => {
    expect(NO_SOUND_TEXT).toBe("Aucun sound dans la soundboard : ajoute-en un dans l'onglet Sons.");
    expect(render({ canCreate: false, isSoundboardEmpty: true })).toContain(
      "Aucun sound dans la soundboard : ajoute-en un dans l&#x27;onglet Sons.",
    );
    expect(render({ canCreate: false })).not.toContain("Aucun sound dans la soundboard");
    expect(render()).not.toContain("Aucun sound dans la soundboard");
  });
});

describe("le rire choisi", () => {
  const details = {
    key: 0,
    rank: 1,
    count: 2,
    at: 20,
    sound: "aaaa0001",
    isOverEnd: false,
    isKept: true,
  };

  it("n'est détaillé que lorsqu'un rire est choisi", () => {
    expect(render()).not.toContain("Retirer");
    expect(render()).not.toContain("Sound du rire");
  });

  it("montre sous la timeline son rang, le choix de son sound et « Retirer »", () => {
    const html = render({ details });
    expect(html).toContain("Rire 1 sur 2 · à 0:20.00");
    expect(html).toContain("Sound du rire");
    expect(html).toContain("Retirer");
  });

  it("grise « Retirer » et le choix du sound pendant qu'un clip est traité", () => {
    expect(isGrayed(render({ details }, { isWorking: true }), "Retirer")).toBe(true);
  });
});

describe("le volume des rires", () => {
  it("est un curseur « Volume des rires » avec sa valeur en %, sous la ligne de « Rire ici »", () => {
    const html = render({}, { laughFader: 35 });
    expect(html).toContain("Volume des rires");
    expect(html).toContain("35 %");
    expect(html).toContain('aria-valuetext="35 %"');
    expect(html.indexOf("Rire ici")).toBeLessThan(html.indexOf("Volume des rires"));
  });

  it("va de 0 à 100 % et montre ses deux bouts", () => {
    const html = render();
    expect(html).toMatch(/type="range"[^>]*min="0"|min="0"[^>]*type="range"/);
    expect(html).toMatch(/type="range"[^>]*max="100"|max="100"[^>]*type="range"/);
    expect(html).toContain("0 %");
    expect(html).toContain("100 %");
  });

  it("montre 100 % quand le clip n'a pas de volume réglé", () => {
    expect(render()).toMatch(/lp-type-numeric">100 %/);
  });

  it("est toujours visible : sans rire, sans rire choisi, soundboard vide", () => {
    expect(render()).toContain("Volume des rires");
    expect(render({ canCreate: false, isSoundboardEmpty: true })).toContain("Volume des rires");
  });

  it("se grise pendant qu'un clip est traité, et seulement alors", () => {
    expect(render({}, { isWorking: true })).toMatch(/<input[^>]*type="range"[^>]*disabled=""/);
    expect(render()).not.toMatch(/<input[^>]*type="range"[^>]*disabled=""/);
  });

  it("rend le volume choisi, au relâchement comme à chaque cran franchi", () => {
    const chosen: number[] = [];
    const element = ClipTimelineSection({
      duration: 118.55,
      trim: { start: 10, end: 60 },
      time: 25,
      isTrimLocked: false,
      isWorking: false,
      laughs: NO_LAUGHS,
      laughFader: 100,
      sounds: [sound],
      onSeek: () => undefined,
      onLaughFaderChange: (fader) => chosen.push(fader),
      onStartChange: () => undefined,
      onEndChange: () => undefined,
      onPlayKept: () => undefined,
    });
    const [slider] = listElements(element.props.children, Slider);
    type SliderHandlers = { onPick: (value: number) => void; onMove: (value: number) => void };
    expect(isValidElement<SliderHandlers>(slider)).toBe(true);
    if (isValidElement<SliderHandlers>(slider)) {
      slider.props.onMove(60);
      slider.props.onPick(45);
    }
    expect(chosen).toEqual([60, 45]);
  });
});

// Les éléments d'un type dans l'arbre qu'un composant sans état rend (sans le monter).
const listElements = (node: ReactNode, type: unknown): unknown[] =>
  Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    return [...(child.type === type ? [child] : []), ...listElements(child.props.children, type)];
  });
