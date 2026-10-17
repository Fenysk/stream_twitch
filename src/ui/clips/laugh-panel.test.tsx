import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SoundSummary } from "../../domain/sound.schema";
import { Button } from "../design/button";
import type { LaughDetails } from "./clip-laughs";
import { LaughChoice } from "./laugh-choice";
import { LaughPanel, NOT_KEPT_TEXT, OVER_END_TEXT } from "./laugh-panel";

const sound = (id: string, title: string): SoundSummary => ({
  id,
  title,
  cost: 100,
  pace: 30,
  fader: 80,
  version: "1-1",
  hasReward: true,
  isManaged: true,
});

const SOUNDS = [sound("aaaa0001", "Applaudissements"), sound("bbbb0002", "Rire gras")];

const DETAILS: LaughDetails = {
  key: 1,
  rank: 2,
  count: 3,
  at: 12.5,
  sound: "bbbb0002",
  isOverEnd: false,
  isKept: true,
};

const render = (details: Partial<LaughDetails> = {}, isDisabled = false) =>
  renderToStaticMarkup(
    <LaughPanel
      details={{ ...DETAILS, ...details }}
      sounds={SOUNDS}
      isDisabled={isDisabled}
      onUpdate={() => undefined}
      onDelete={() => undefined}
    />,
  );

describe("le rire choisi sous la timeline", () => {
  it("dit son rang et son instant : « Rire 2 sur 3 · à 0:12.50 »", () => {
    expect(render()).toContain("Rire 2 sur 3 · à 0:12.50");
    expect(render({ rank: 1, count: 1, at: 118.55 })).toContain("Rire 1 sur 1 · à 1:58.55");
  });

  it("propose le sound du rire : les sounds par titre, celui du rire coché, sans « Aucun »", () => {
    const html = render();
    expect(html).toContain("Sound du rire");
    expect(html).toContain("Applaudissements");
    expect(html).toMatch(/value="bbbb0002"[^>]*checked=""|checked=""[^>]*value="bbbb0002"/);
    expect(html).not.toContain("Aucun");
  });

  it("propose « Retirer »", () => {
    expect(render()).toContain("Retirer");
  });

  it("ne dit rien d'inquiétant d'un rire qui joue comme prévu", () => {
    const html = render();
    expect(html).not.toContain("Dépasse la fin");
    expect(html).not.toContain("Hors de la partie gardée");
  });

  it("dit qu'un rire dépasse la fin : la dernière image attend", () => {
    expect(OVER_END_TEXT).toBe("Dépasse la fin : la dernière image attend.");
    expect(render({ isOverEnd: true })).toContain("Dépasse la fin : la dernière image attend.");
  });

  it("dit qu'un rire est hors de la partie gardée : il ne sera pas joué", () => {
    expect(NOT_KEPT_TEXT).toBe("Hors de la partie gardée : il ne sera pas joué.");
    expect(render({ isKept: false })).toContain("Hors de la partie gardée : il ne sera pas joué.");
  });

  it("peut dire les deux à la fois", () => {
    const html = render({ isKept: false, isOverEnd: true });
    expect(html).toContain("Dépasse la fin");
    expect(html).toContain("Hors de la partie gardée");
  });

  it("grise le choix du sound et « Retirer » pendant qu'un clip est traité", () => {
    const html = render({}, true);
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Retirer/s);
  });
});

// Les éléments d'un type dans l'arbre qu'un composant sans état rend (sans le monter).
const listElements = (node: ReactNode, type: unknown): unknown[] =>
  Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    return [...(child.type === type ? [child] : []), ...listElements(child.props.children, type)];
  });

describe("les actions du rire choisi", () => {
  it("change le sound du rire et le retire par les fonctions données", () => {
    const calls: string[] = [];
    const element = LaughPanel({
      details: DETAILS,
      sounds: SOUNDS,
      isDisabled: false,
      onUpdate: (id) => calls.push(`sound ${id}`),
      onDelete: () => calls.push("retiré"),
    });
    const [choice] = listElements(element.props.children, LaughChoice);
    expect(isValidElement<{ onSelect: (id: string) => void }>(choice)).toBe(true);
    if (isValidElement<{ onSelect: (id: string) => void }>(choice)) choice.props.onSelect("aaaa0001");
    expect(calls).toEqual(["sound aaaa0001"]);
    const [deleteButton] = listElements(element.props.children, Button);
    expect(isValidElement<{ onPress: () => void }>(deleteButton)).toBe(true);
    if (isValidElement<{ onPress: () => void }>(deleteButton)) deleteButton.props.onPress();
    expect(calls).toEqual(["sound aaaa0001", "retiré"]);
  });
});
