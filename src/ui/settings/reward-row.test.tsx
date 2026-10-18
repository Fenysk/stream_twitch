import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RewardSummary } from "../../domain/reward.schema";
import type { RewardPhrasesEntry } from "../../domain/reward-phrase.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import { RewardRow } from "./reward-row";

const reward: RewardSummary = {
  id: "mien",
  title: "Rire <b>gras</b>",
  cost: 250,
  pace: 45,
  isManaged: true,
  isMissing: false,
  sound: "rire0001",
};

const sounds: SoundSummary[] = [
  { id: "bravo002", title: "Bravo", fader: 80, version: "1", rewardTitles: [], clipCount: 0 },
  { id: "rire0001", title: "Rire", fader: 80, version: "1", rewardTitles: ["Rire"], clipCount: 0 },
];

const phrases: RewardPhrasesEntry = {
  id: "mien",
  title: "Rire <b>gras</b>",
  isMissing: false,
  isReserved: false,
  phrases: ["Haha {user} !"],
};

const render = (
  overrides: {
    reward?: Partial<RewardSummary>;
    phrases?: RewardPhrasesEntry | null;
    sounds?: SoundSummary[] | null;
    isBusy?: boolean;
  } = {},
): string =>
  renderToStaticMarkup(
    createElement(RewardRow, {
      reward: { ...reward, ...overrides.reward },
      phrases: overrides.phrases === undefined ? phrases : overrides.phrases,
      sounds: overrides.sounds === undefined ? sounds : overrides.sounds,
      isBusy: overrides.isBusy ?? false,
      onPickSound: async () => null,
      onSavePhrases: async () => null,
      onTestPhrases: async () => null,
      onEdit: () => undefined,
      onDelete: () => undefined,
    }),
  );

describe("une récompense de la chaîne", () => {
  it("montre son titre (jamais comme du HTML), son coût et son cooldown", () => {
    const html = render();
    expect(html).toContain("Rire &lt;b&gt;gras&lt;/b&gt;");
    expect(html).not.toContain("<b>gras</b>");
    expect(html).toContain("250 points · cooldown 45 s");
    expect(render({ reward: { pace: 0 } })).toContain("250 points · sans cooldown");
  });

  it("dit qui l'a créée : l'application, ou Alexis sur Twitch", () => {
    expect(render()).toContain("Créée par l&#x27;application");
    expect(render()).not.toContain("Faite sur Twitch");
    expect(render({ reward: { isManaged: false } })).toContain("Faite sur Twitch");
    expect(render({ reward: { isManaged: false } })).not.toContain("Créée par");
  });

  it("dit ce qui arrive aux points si le son ne joue pas, selon qui a créé la récompense", () => {
    expect(render()).toContain("Points rendus si le son ne joue pas");
    expect(render()).not.toContain("Points non rendus");
    const fromTwitch = render({ reward: { isManaged: false } });
    expect(fromTwitch).toContain("Se règle sur Twitch. Points non rendus si le son ne joue pas.");
    expect(fromTwitch).not.toContain("Points rendus si");
  });

  it("propose « Aucun » puis les sounds, avec celui de la récompense choisi", () => {
    const html = render();
    expect(html).toContain("Son");
    expect(html).toContain('<option value="">Aucun</option>');
    expect(html).toContain('<option value="bravo002">Bravo</option>');
    expect(html).toContain('<option value="rire0001" selected="">Rire</option>');
    expect(render({ reward: { sound: null } })).toContain('<option value="" selected="">Aucun</option>');
  });

  it("grise le menu tant que la liste des sounds n'est pas lue, ou pendant une demande", () => {
    expect(render({ sounds: null })).toMatch(/<select[^>]*disabled/);
    expect(render({ isBusy: true })).toMatch(/<select[^>]*disabled/);
    expect(render()).not.toMatch(/<select[^>]*disabled/);
  });

  it("propose de modifier et de supprimer seulement une récompense que l'application a créée", () => {
    const own = render();
    expect(own).toContain('title="Modifier"');
    expect(own).toContain('title="Supprimer"');
    const fromTwitch = render({ reward: { isManaged: false } });
    expect(fromTwitch).not.toContain('title="Modifier"');
    expect(fromTwitch).not.toContain('title="Supprimer"');
    expect(render({ isBusy: true }).match(/<button[^>]*disabled/g)).toHaveLength(2);
  });

  it("ne demande pas la confirmation avant le premier clic sur Supprimer", () => {
    const html = render();
    expect(html).not.toContain("Supprimer pour de bon");
    expect(html).not.toContain("disparaît aussi de Twitch");
  });

  it("badge « N'existe plus sur Twitch » une récompense disparue : ni coût ni note, mais son menu et ses phrases", () => {
    const html = render({ reward: { isMissing: true, cost: 0, pace: 0 } });
    expect(html).toContain("N&#x27;existe plus sur Twitch");
    expect(html).not.toContain("points");
    expect(html).not.toContain("Points rendus");
    expect(html).toContain("<select");
    expect(html).toContain("Haha {user} !");
    expect(html).not.toContain('title="Modifier"');
    expect(html).toContain('title="Supprimer"');
  });

  it("montre les phrases de Jean-Renard sous le menu, ou rien quand la liste des phrases n'est pas lue", () => {
    expect(render()).toContain("Phrases de Jean-Renard");
    expect(render()).toContain("Haha {user} !");
    expect(render({ phrases: null })).not.toContain("Phrases de Jean-Renard");
    expect(render({ phrases: { ...phrases, isReserved: true } })).toContain(
      "Phrases réglées dans l&#x27;onglet Renard",
    );
  });
});
