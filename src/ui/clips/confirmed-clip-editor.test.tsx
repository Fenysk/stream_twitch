import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConfirmedSummary, ConfirmRequest } from "../../domain/clip.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import { ConfirmedClipEditor } from "./confirmed-clip-editor";

const clip: ConfirmedSummary = {
  name: "Replay 2026-10-15 15-09-05.mp4",
  title: "Le saut <b>fou</b>",
  phrase: "Quel saut !",
  start: 12.5,
  end: 72.5,
  rawName: "Replay 2026-10-15 15-09-05.mp4",
  processedName: "Replay 2026-10-15 15-09-05 (2).mp4",
  confirmedAt: "2026-10-16T10:24:46.845Z",
  version: "1792151962252-15",
};

const render = (
  overrides: Partial<ConfirmedSummary> = {},
  isWorking = false,
  sounds: SoundSummary[] | null = null,
) =>
  renderToStaticMarkup(
    <ConfirmedClipEditor
      clip={{ ...clip, ...overrides }}
      sounds={sounds}
      isWorking={isWorking}
      onRevise={async () => null}
      onWithdraw={async () => null}
      onDone={() => undefined}
    />,
  );

// L'éditeur sans le rendre : ce qu'il donne au plan de travail, et ce que ses actions envoient.
const shallow = (overrides: Partial<ConfirmedSummary> = {}) => {
  const revised: ConfirmRequest[] = [];
  const element = ConfirmedClipEditor({
    clip: { ...clip, ...overrides },
    sounds: null,
    isWorking: false,
    onRevise: async (request) => {
      revised.push(request);
      return null;
    },
    onWithdraw: async () => null,
    onDone: () => undefined,
  });
  return { props: element.props, revised };
};

describe("l'éditeur d'un clip de l'émission", () => {
  it("lit le clip brut d'origine dans Traités, sous le nom que le JSON garde (renommé compris)", () => {
    const html = render();
    expect(html).toContain('src="/api/clips/processed-video?name=Replay%202026-10-15%2015-09-05%20(2).mp4"');
    expect(html).not.toContain("/api/show/video");
  });

  it("remplit le titre et la phrase, comme du texte jamais comme du HTML", () => {
    const html = render();
    expect(html).toContain('value="Le saut &lt;b&gt;fou&lt;/b&gt;"');
    expect(html).not.toContain("<b>fou</b>");
    expect(html).toContain("Quel saut !");
  });

  it("propose d'enregistrer et de retirer le clip de l'émission, sans Valider ni Jeter", () => {
    const html = render();
    expect(html).toContain("Enregistrer");
    expect(html).toContain("Retirer de l&#x27;émission");
    expect(html).not.toContain("Valider");
    expect(html).not.toContain("Jeter");
  });

  it("ne dit rien de verrouillé tant que le clip brut est là", () => {
    expect(render()).not.toContain("n&#x27;est plus dans Traités");
  });

  it("lit la vidéo confirmée, versionnée, quand le clip brut n'est plus dans Traités, et le dit", () => {
    const html = render({ processedName: null });
    expect(html).toContain(
      'src="/api/show/video?name=Replay%202026-10-15%2015-09-05.mp4&amp;v=1792151962252-15"',
    );
    expect(html).toContain("Le clip brut d&#x27;origine n&#x27;est plus dans Traités");
    expect(html).toContain("seuls le titre et la phrase se modifient");
    expect(html).toContain('value="Le saut &lt;b&gt;fou&lt;/b&gt;"');
  });

  it("ne montre plus la liste « Rires à la fin » ni les sounds : les rires se posent sur la timeline, une fois la durée connue", () => {
    const sounds: SoundSummary[] = [
      {
        id: "aaaa0001",
        title: "Rire gras",
        fader: 80,
        version: "1-1",
        rewardTitles: [],
        clipCount: 0,
      },
    ];
    const html = render({ laughs: [{ at: 14, sound: "aaaa0001" }] }, false, sounds);
    expect(html).not.toContain("Rires à la fin");
    expect(html).not.toContain("Rire gras");
    expect(html).not.toContain("disparu1");
  });

  it("donne au plan de travail les rires du clip, en secondes du clip brut", () => {
    const laughs = [
      { at: 14, sound: "aaaa0001" },
      { at: 30.5, sound: "bbbb0002" },
    ];
    expect(shallow({ laughs }).props.initialLaughs).toEqual(laughs);
    expect(shallow().props.initialLaughs).toBeUndefined();
  });

  it("montre le volume des rires enregistré avec le clip, et 100 % quand il n'en a pas", () => {
    expect(shallow({ laughFader: 35 }).props.initialLaughFader).toBe(35);
    expect(shallow({ laughFader: 0 }).props.initialLaughFader).toBe(0);
    expect(shallow().props.initialLaughFader).toBe(100);
  });

  it("lit le clip brut depuis son début quand il est dans Traités : la partie gardée est celle du JSON", () => {
    const { props } = shallow();
    expect(props.videoStart).toBe(0);
    expect(props.initialTrim).toEqual({ start: 12.5, end: 72.5 });
    expect(props.lockedMessage).toBeUndefined();
  });

  it("décale la vidéo lue du début gardé quand seul le clip confirmé reste : les rires restent en secondes du clip brut", () => {
    const { props } = shallow({ processedName: null });
    expect(props.videoStart).toBe(12.5);
    expect(props.initialTrim).toEqual({ start: 0, end: 60 });
    expect(props.lockedMessage).toContain("n'est plus dans Traités");
  });

  it("enregistre les rires posés avec le début et la fin du JSON quand le clip brut n'est plus là, sans rien recoder", async () => {
    const { props, revised } = shallow({ processedName: null });
    const laughs = [{ at: 40, sound: "aaaa0001" }];
    await props.primary.run({
      title: "Le saut",
      phrase: "Quel saut !",
      trim: { start: 0, end: 60 },
      laughs,
      laughFader: 60,
    });
    expect(revised).toEqual([
      {
        name: clip.name,
        title: "Le saut",
        phrase: "Quel saut !",
        start: 12.5,
        end: 72.5,
        laughs,
        laughFader: 60,
      },
    ]);
  });

  it("enregistre le début et la fin choisis, avec les rires posés, quand le clip brut est dans Traités", async () => {
    const { props, revised } = shallow();
    const laughs = [{ at: 20, sound: "aaaa0001" }];
    await props.primary.run({
      title: "Le saut",
      phrase: "",
      trim: { start: 15, end: 70 },
      laughs,
      laughFader: 100,
    });
    expect(revised).toEqual([
      { name: clip.name, title: "Le saut", phrase: "", start: 15, end: 70, laughs, laughFader: 100 },
    ]);
  });

  it("grise tout pendant qu'un clip est traité", () => {
    expect(render({}, true).match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
