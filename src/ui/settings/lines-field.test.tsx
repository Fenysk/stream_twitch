import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EditableSettings } from "../../domain/settings.schema";
import { FOX_READ_LISTS } from "./fox-fields";
import { LinesField } from "./lines-field";
import type { UseSettings } from "./use-settings";

const spec = { key: "foxJabs", label: "Piques", help: "Une pique par ligne.", rows: 4 } as const;

const settings = (byKey: Partial<Record<string, string>> = {}): UseSettings => ({
  view: null,
  drafts: {},
  errors: { byKey, general: [] },
  edit: () => undefined,
  choose: async () => undefined,
  change: async () => true,
  reset: async () => undefined,
});

const render = (effective: Partial<EditableSettings>, byKey: Partial<Record<string, string>> = {}): string =>
  renderToStaticMarkup(
    createElement(LinesField, { spec, settings: settings(byKey), effective: effective as EditableSettings }),
  );

describe("le champ d'une liste de phrases", () => {
  it("montre la liste qui s'applique, une phrase par ligne, sous son libellé et son aide", () => {
    const html = render({ foxJabs: ["Première pique", "Seconde pique"] });
    expect(html).toContain("Piques");
    expect(html).toContain("Première pique\nSeconde pique");
    expect(html).toContain("Une pique par ligne.");
    expect(html).toContain('rows="4"');
  });

  it("montre un champ vide quand la liste est vide ou absente", () => {
    expect(render({ foxJabs: [] })).toContain("></textarea>");
    expect(render({})).toContain("></textarea>");
  });

  it("n'écrit pas de variables pour une liste qui n'en a pas (les piques)", () => {
    expect(render({ foxJabs: ["A"] })).not.toContain("Variables");
  });

  it("montre les comptes ignorés, un par ligne, sous leur libellé et leur aide", () => {
    const [botsSpec] = FOX_READ_LISTS;
    if (!botsSpec) throw new Error("liste des comptes ignorés absente");
    const html = renderToStaticMarkup(
      createElement(LinesField, {
        spec: botsSpec,
        settings: settings(),
        effective: { chatBots: ["nightbot", "wzbot"] } as EditableSettings,
      }),
    );
    expect(html).toContain("Comptes ignorés");
    expect(html).toContain("nightbot\nwzbot");
    expect(html).toContain("jamais lus par Jean-Renard");
    expect(html).not.toContain("Variables");
  });

  it("écrit le refus du serveur sous le champ", () => {
    const html = render({ foxJabs: ["A"] }, { foxJabs: "ligne 2 : ne peut pas être vide" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("ligne 2 : ne peut pas être vide");
  });
});
