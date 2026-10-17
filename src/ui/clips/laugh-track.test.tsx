import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LaughBlock } from "./clip-laughs";
import { ClipTimeline } from "./clip-timeline";
import { LaughTrack } from "./laugh-track";

const block = (overrides: Partial<LaughBlock> = {}): LaughBlock => ({
  key: 0,
  at: 20,
  title: "Applaudissements",
  seconds: 5,
  isKept: true,
  isSelected: false,
  ...overrides,
});

const render = (blocks: LaughBlock[], isDisabled = false, duration = 100) =>
  renderToStaticMarkup(
    <ClipTimeline duration={duration} time={0} onSeek={() => undefined}>
      <LaughTrack
        duration={duration}
        blocks={blocks}
        isDisabled={isDisabled}
        onChoose={() => undefined}
        onMove={() => undefined}
      />
    </ClipTimeline>,
  );

describe("la piste Rires", () => {
  it("s'appelle « Rires » et ne montre aucun bloc sans rire", () => {
    const html = render([]);
    expect(html).toMatch(/timeline-name[^>]*>Rires</);
    expect(html).not.toContain("laugh-block");
  });

  it("pose un bloc par rire : son bord gauche à son instant, sa largeur la durée de son sound", () => {
    const html = render([block({ key: 0, at: 20, seconds: 5 }), block({ key: 1, at: 60, seconds: 10 })]);
    expect(html.match(/data-laugh-block/g)).toHaveLength(2);
    expect(html).toContain("left:20%;width:5%");
    expect(html).toContain("left:60%;width:10%");
  });

  it("écrit le titre du sound dans le bloc (coupé par une ellipse en CSS) et le dit aux lecteurs d'écran avec l'instant", () => {
    const html = render([block({ at: 12.5 })]);
    expect(html).toMatch(/laugh-block-label[^>]*>Applaudissements</);
    expect(html).toContain('aria-label="Rire « Applaudissements » à 0:12.50"');
  });

  it("garde une largeur minimale de 8 px, y compris tant que la durée du sound n'est pas lue", () => {
    const html = render([block({ seconds: undefined }), block({ key: 1, at: 50, seconds: 0.01 })]);
    expect(html.match(/min-width:8px/g)).toHaveLength(2);
    expect(html).toContain("left:20%;width:0%");
  });

  it("ne dépasse pas la fin de la zone : un bloc qui commence tard est coupé à la fin", () => {
    const html = render([block({ at: 98, seconds: 5 })]);
    expect(html).toMatch(/left:98%;width:2(\.0+[0-9]*)?%/);
  });

  it("garde un bloc dans la zone quand son instant est hors de la vidéo lue", () => {
    const html = render([block({ at: -4 }), block({ key: 1, at: 150 })]);
    expect(html).toContain("left:0%");
    expect(html).toContain("left:100%;width:0%");
  });

  it("estompe le bloc d'un rire hors de la partie gardée, et lui seul", () => {
    const html = render([block({ key: 0, isKept: false }), block({ key: 1, at: 50 })]);
    expect(html.match(/laugh-block--faded/g)).toHaveLength(1);
  });

  it("entoure d'un contour d'accent le bloc du rire choisi, et le dit : pressé, lui seul", () => {
    const html = render([block({ key: 0, isSelected: true }), block({ key: 1, at: 50 })]);
    expect(html.match(/laugh-block--selected/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
  });

  it("grise les blocs pendant qu'un clip est traité", () => {
    expect(render([block()], true)).toMatch(/<button[^>]*disabled=""/);
    expect(render([block()])).not.toContain('disabled=""');
  });

  it("est un bouton par bloc, qui garde le focus au clavier (Tab)", () => {
    expect(render([block()])).toMatch(/<button type="button" data-laugh-block=""/);
  });
});
