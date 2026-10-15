import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SoundSummary } from "../../domain/sound.schema";
import { SoundRow } from "./sound-row";

const sound: SoundSummary = {
  id: "rire0001",
  title: "Rire <b>gras</b>",
  cost: 100,
  pace: 30,
  fader: 80,
  version: "1.10",
  hasReward: true,
  isManaged: true,
};

const render = (
  overrides: { sound?: SoundSummary; isPlaying?: boolean; isBusy?: boolean; isMissing?: boolean } = {},
): string =>
  renderToStaticMarkup(
    createElement(SoundRow, {
      sound: overrides.sound ?? sound,
      isPlaying: overrides.isPlaying ?? false,
      isBusy: overrides.isBusy ?? false,
      isMissing: overrides.isMissing ?? false,
      onPreview: () => undefined,
      onPlay: () => undefined,
      onEdit: () => undefined,
      onDelete: () => undefined,
    }),
  );

describe("un son de la liste", () => {
  it("montre le titre (jamais comme du HTML) et ses réglages : coût, cooldown, volume", () => {
    const html = render();
    expect(html).toContain("Rire &lt;b&gt;gras&lt;/b&gt;");
    expect(html).not.toContain("<b>gras</b>");
    expect(html).toContain("100 points · cooldown 30 s · volume 80 %");
  });

  it("signale un son sans reward : « Pas sur Twitch », et rien pour un son qui en a un", () => {
    expect(render()).not.toContain("Pas sur Twitch");
    expect(render({ sound: { ...sound, hasReward: false } })).toContain("Pas sur Twitch");
  });

  it("badge « Pas sur Twitch » un son dont la récompense a disparu de Twitch : le son reste", () => {
    const html = render({ isMissing: true });
    expect(html).toContain("Pas sur Twitch");
    expect(html).toContain("Cette récompense n&#x27;existe plus sur Twitch");
    expect(html).toContain("Rire &lt;b&gt;gras&lt;/b&gt;");
  });

  it("dit d'une récompense faite sur Twitch qu'elle s'y règle et que les points ne sont pas rendus si le son ne joue pas", () => {
    const own = render();
    expect(own).not.toContain("Se règle sur Twitch");
    expect(own).not.toContain("Points non rendus");
    const html = render({ sound: { ...sound, isManaged: false } });
    expect(html).toContain("Se règle sur Twitch");
    expect(html).toContain("Points non rendus si le son ne joue pas.");
  });

  it("dit « sans cooldown » pour une pace de 0", () => {
    expect(render({ sound: { ...sound, pace: 0 } })).toContain("100 points · sans cooldown · volume 80 %");
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
});
