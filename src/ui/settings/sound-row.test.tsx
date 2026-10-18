import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SoundSummary } from "../../domain/sound.schema";
import { SoundRow } from "./sound-row";

const sound: SoundSummary = {
  id: "rire0001",
  title: "Rire <b>gras</b>",
  fader: 80,
  version: "1.10",
  rewardTitles: [],
  clipCount: 0,
};

const render = (overrides: { sound?: SoundSummary; isPlaying?: boolean; isBusy?: boolean } = {}): string =>
  renderToStaticMarkup(
    createElement(SoundRow, {
      sound: overrides.sound ?? sound,
      isPlaying: overrides.isPlaying ?? false,
      isBusy: overrides.isBusy ?? false,
      onPreview: () => undefined,
      onPlay: () => undefined,
      onEdit: () => undefined,
      onDelete: () => undefined,
    }),
  );

describe("un sound de la liste", () => {
  it("montre le titre (jamais comme du HTML) et son volume, sans coût ni cooldown : ils sont ceux d'une récompense", () => {
    const html = render();
    expect(html).toContain("Rire &lt;b&gt;gras&lt;/b&gt;");
    expect(html).not.toContain("<b>gras</b>");
    expect(html).toContain("volume 80 %");
    expect(html).not.toContain("points");
    expect(html).not.toContain("cooldown");
  });

  it("dit « Pas utilisé » d'un sound que ni récompense ni clip n'utilise, et ne parle plus de Twitch", () => {
    const html = render();
    expect(html).toContain("Pas utilisé");
    expect(html).not.toContain("Pas sur Twitch");
    expect(html).not.toContain("Joué par");
  });

  it("dit quelles récompenses le jouent et combien de clips ont un de ses rires", () => {
    const played = render({ sound: { ...sound, rewardTitles: ["Prout."], clipCount: 3 } });
    expect(played).toContain("Joué par « Prout. »");
    expect(played).toContain("Rires de 3 clips");
    expect(played).not.toContain("Pas utilisé");
    const several = render({ sound: { ...sound, rewardTitles: ["Applaudir", "Prout."], clipCount: 1 } });
    expect(several).toContain("Joué par « Applaudir », « Prout. »");
    expect(several).toContain("Rires de 1 clip");
    expect(several).not.toContain("Rires de 1 clips");
  });

  it("ne montre pas de nombre de clips quand le dossier des clips est illisible, et ne dit pas « Pas utilisé »", () => {
    const unread = render({ sound: { ...sound, clipCount: null } });
    expect(unread).toContain("non comptés");
    expect(unread).not.toContain("Pas utilisé");
    const rewarded = render({ sound: { ...sound, rewardTitles: ["Prout."], clipCount: null } });
    expect(rewarded).toContain("Joué par « Prout. »");
    expect(rewarded).not.toContain("Rires de");
    expect(rewarded).not.toContain("non comptés");
  });

  it("propose « Écouter » et « Jouer dans OBS », puis « Arrêter » pendant l'écoute", () => {
    const idle = render();
    expect(idle).toContain("Écouter");
    expect(idle).toContain("Jouer dans OBS");
    expect(idle).not.toContain("Arrêter");
    expect(render({ isPlaying: true })).toContain("Arrêter");
  });

  it("propose de modifier et de supprimer, et grise les deux pendant une demande", () => {
    const idle = render();
    expect(idle).toContain('title="Modifier"');
    expect(idle).toContain('title="Supprimer"');
    expect(idle).not.toContain("disabled");
    expect(render({ isBusy: true }).match(/disabled/g)).toHaveLength(2);
  });

  it("ne demande pas la confirmation avant le premier clic sur Supprimer, même pour un sound utilisé", () => {
    const html = render({ sound: { ...sound, rewardTitles: ["Prout."], clipCount: 3 } });
    expect(html).not.toContain("Utilisé par");
    expect(html).not.toContain("Supprimer pour de bon");
  });
});
