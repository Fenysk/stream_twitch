import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SoundSummary } from "../../domain/sound.schema";
import { LaughChoice, toLaughChoices } from "./laugh-choice";

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

const SOUNDS = [
  sound("cccc0003", "Rire gras"),
  sound("aaaa0001", "Applaudissements"),
  sound("bbbb0002", "Rire enregistré"),
];

describe("toLaughChoices", () => {
  it("propose les sounds par ordre alphabétique de titre", () => {
    expect(toLaughChoices(SOUNDS)).toEqual([
      { value: "aaaa0001", label: "Applaudissements" },
      { value: "bbbb0002", label: "Rire enregistré" },
      { value: "cccc0003", label: "Rire gras" },
    ]);
  });

  it("ne propose rien tant que la soundboard n'est pas lue, ou quand elle est vide", () => {
    expect(toLaughChoices(null)).toEqual([]);
    expect(toLaughChoices([])).toEqual([]);
  });

  it("ne propose pas « Aucun » : un rire dont on ne veut plus se retire", () => {
    expect(toLaughChoices(SOUNDS).map(({ label }) => label)).not.toContain("Aucun");
    expect(toLaughChoices(SOUNDS)).toHaveLength(3);
  });

  it("ne change pas la liste qu'on lui donne", () => {
    const given = [...SOUNDS];
    toLaughChoices(given);
    expect(given).toEqual(SOUNDS);
  });
});

describe("le choix du sound du rire choisi", () => {
  const render = (value: string, isDisabled = false, sounds: SoundSummary[] | null = SOUNDS) =>
    renderToStaticMarkup(
      <LaughChoice sounds={sounds} value={value} isDisabled={isDisabled} onSelect={() => undefined} />,
    );

  it("liste les titres des sounds en boutons radio, sous « Sound du rire », sans « Aucun »", () => {
    const html = render("aaaa0001");
    expect(html).toContain("Sound du rire");
    expect(html).toContain("Applaudissements");
    expect(html).toContain("Rire enregistré");
    expect(html).toContain("Rire gras");
    expect(html).not.toContain("Aucun");
    expect(html.match(/type="radio"/g)).toHaveLength(3);
  });

  it("coche le sound du rire, et lui seul", () => {
    const html = render("bbbb0002");
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toMatch(/value="bbbb0002"[^>]*checked=""|checked=""[^>]*value="bbbb0002"/);
  });

  it("ne coche rien quand le sound du rire n'est plus dans la soundboard", () => {
    expect(render("disparu1").match(/checked=""/g)).toBeNull();
  });

  it("ne propose aucun choix tant que la soundboard n'est pas lue", () => {
    expect(render("aaaa0001", false, null).match(/type="radio"/g)).toBeNull();
  });

  it("se grise pendant qu'un clip est traité, et seulement alors", () => {
    expect(render("aaaa0001", true)).toMatch(/<fieldset[^>]*disabled=""/);
    expect(render("aaaa0001")).not.toMatch(/<fieldset[^>]*disabled=""/);
  });

  it("dit à quoi sert le sound : joué à l'instant du rire, puis la phrase de Jean-Renard", () => {
    const html = render("aaaa0001");
    expect(html).toContain("joué à l&#x27;instant du rire");
    expect(html).toContain("Jean-Renard dit ensuite que les rires sont enregistrés");
  });

  it("rend l'identifiant du sound choisi", () => {
    const chosen: string[] = [];
    const element = LaughChoice({
      sounds: SOUNDS,
      value: "aaaa0001",
      isDisabled: false,
      onSelect: (id) => chosen.push(id),
    });
    const [list] = Children.toArray(element.props.children);
    expect(isValidElement<{ onSelect: (value: string) => void }>(list)).toBe(true);
    if (isValidElement<{ onSelect: (value: string) => void }>(list)) list.props.onSelect("cccc0003");
    expect(chosen).toEqual(["cccc0003"]);
  });
});
