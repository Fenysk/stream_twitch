import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClipSummary, ConfirmRequest } from "../../domain/clip.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import { ClipEditor } from "./clip-editor";

const clip: ClipSummary = { name: "Replay 2026-10-15 15-09-05.mp4", modifiedAt: 0, duration: 118.55 };

const render = (isWorking = false, sounds: SoundSummary[] | null = null) =>
  renderToStaticMarkup(
    <ClipEditor
      clip={clip}
      sounds={sounds}
      isWorking={isWorking}
      onConfirm={async () => null}
      onDiscard={async () => null}
      onDone={() => undefined}
    />,
  );

describe("l'éditeur d'un clip brut", () => {
  it("montre le lecteur du clip, le titre obligatoire, la phrase facultative et les deux boutons", () => {
    const html = render();
    expect(html).toContain('src="/api/clips/video?name=Replay%202026-10-15%2015-09-05.mp4"');
    expect(html).toContain("Titre");
    expect(html).toContain("Obligatoire pour valider");
    expect(html).toContain("Phrase de Jean-Renard");
    expect(html).toContain("Facultatif : vide, il se tait.");
    expect(html).toContain("Valider");
    expect(html).toContain("Jeter");
  });

  it("rappelle les raccourcis : I, O, R pour un rire, Suppr pour le retirer, les flèches et Espace", () => {
    const html = render();
    expect(html).toContain("I pose le début, O la fin, R un rire à la position de lecture,");
    expect(html).toContain("Suppr retire le rire choisi,");
    expect(html).toContain("← et → avancent d&#x27;une image (en pause), Espace lit ou arrête.");
    expect(html).toContain("Raccourcis :");
  });

  it("ne laisse pas valider sans titre, ni sans durée connue : « Valider » est grisé", () => {
    expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Valider/s);
  });

  it("ne montre la timeline qu'une fois la durée du clip connue, et plus la liste « Rires à la fin »", () => {
    const html = render(false, [
      {
        id: "aaaa0001",
        title: "Rire gras",
        cost: 100,
        pace: 30,
        fader: 80,
        version: "1-1",
        hasReward: true,
        isManaged: true,
      },
    ]);
    expect(html).not.toContain("timeline");
    expect(html).not.toContain("Rire ici");
    expect(html).not.toContain("Rires à la fin");
    expect(html).not.toContain("Rire gras");
  });

  it("grise tout pendant qu'un clip est traité : champs, Valider et Jeter", () => {
    const html = render(true);
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe("les actions de l'éditeur d'un clip brut", () => {
  const trim = { start: 3, end: 40.5 };
  const laughs = [
    { at: 12.5, sound: "aaaa0001" },
    { at: 30, sound: "bbbb0002" },
  ];

  const setup = () => {
    const confirmed: ConfirmRequest[] = [];
    const discarded: string[] = [];
    const element = ClipEditor({
      clip,
      sounds: null,
      isWorking: false,
      onConfirm: async (request) => {
        confirmed.push(request);
        return null;
      },
      onDiscard: async (name) => {
        discarded.push(name);
        return null;
      },
      onDone: () => undefined,
    });
    return { props: element.props, confirmed, discarded };
  };

  it("n'a aucun rire au départ et lit le clip brut depuis son début : la vidéo n'est pas décalée", () => {
    const { props } = setup();
    expect(props.initialLaughs).toBeUndefined();
    expect(props.videoStart).toBeUndefined();
  });

  it("valide avec le titre, la phrase, la partie gardée et les rires posés", async () => {
    const { props, confirmed } = setup();
    expect(await props.primary.run({ title: "Le saut", phrase: "Quel saut !", trim, laughs })).toBeNull();
    expect(confirmed).toEqual([
      { name: clip.name, title: "Le saut", phrase: "Quel saut !", start: 3, end: 40.5, laughs },
    ]);
  });

  it("jette le clip brut, sans rien envoyer d'autre que son nom", async () => {
    const { props, discarded } = setup();
    await props.secondary.run({ title: "", phrase: "", trim, laughs });
    expect(discarded).toEqual([clip.name]);
  });
});
