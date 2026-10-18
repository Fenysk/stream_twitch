import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatLook } from "../../domain/chat.schema";
import { DEFAULT_CHAT_LOOK } from "../../domain/chat-settings.rules";
import type { HeadView } from "../../domain/head.types";
import { toImageUrls } from "../expression-urls";
import type { ShownHead } from "../use-head-view";
import { ShowStage } from "./show-stage";
import type { ShowView } from "./show-view";

// Ce que le déroulé montre, par test : le temps de l'émission, le fader du son que le serveur dit, la tête reçue, le tchat (`look`).
const state = vi.hoisted(() => ({
  view: { kind: "none" } as { kind: string; title?: string; slot?: number; day?: string },
  fader: 100,
  head: null as ShownHead | null,
  look: null as ChatLook | null,
}));

vi.mock("./use-show", () => ({
  useShow: () => ({
    videos: [{ current: null }, { current: null }],
    view: state.view as ShowView,
    head: state.head,
    fader: state.fader,
  }),
}));

vi.mock("../chat/use-chat-view", () => ({ useChatView: () => ({ look: state.look }) }));

beforeEach(() => {
  state.view = { kind: "none" };
  state.fader = 100;
  state.head = null;
  state.look = null;
});

const render = (): string => renderToStaticMarkup(<ShowStage />);

describe("la page de l'émission", () => {
  it("ne montre rien hors émission : deux vidéos, un bandeau et un titre cachés, sans texte", () => {
    const html = render();
    expect(html.match(/<video/g)).toHaveLength(2);
    expect(html).not.toContain("is-visible");
    expect(html).not.toContain("is-blurred");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-appearance="dark"');
    expect(html).toContain('data-view="none"');
    expect(html.replace(/<[^>]*>/g, "")).toBe("");
  });

  it("montre le bandeau de l'ouverture et de la clôture, avec Jean-Renard grand à droite, sans vidéo", () => {
    for (const [kind, title] of [
      ["opening", "Les bêtises de Fenysk"],
      ["closing", "À la prochaine !"],
    ] as const) {
      state.view = { kind };
      const html = render();
      expect(html).toContain(`data-view="${kind}"`);
      expect(html).toMatch(/show-banner is-visible/);
      expect(html).toContain(title);
      expect(html).toContain("show-fox is-beside");
      expect(html.match(/is-visible/g)).toHaveLength(1);
    }
  });

  it("montre dans le carton le jour du clip en petit et son titre en gros, sur le début du clip flou, Jean-Renard grand à droite", () => {
    state.view = { kind: "card", slot: 1, title: "Le saut <b>fou</b>", day: "2020-10-16" };
    const html = render();
    expect(html).toContain('<p class="show-banner-kicker">16 octobre 2020</p>');
    expect(html).toContain("Le saut &lt;b&gt;fou&lt;/b&gt;");
    expect(html).toMatch(/show-banner is-visible/);
    const videos = html.match(/<video[^>]*>/g) ?? [];
    expect(videos[0]).not.toContain("is-visible");
    expect(videos[1]).toContain("is-visible");
    expect(videos[1]).toContain("is-blurred");
    expect(html).toContain("show-fox is-beside");
    expect(html).not.toMatch(/Clip \d+ sur \d+/);
  });

  it("montre la vidéo nette de l'emplacement qui joue, sans bandeau, avec le titre du clip dans un coin et Jean-Renard petit", () => {
    state.view = { kind: "clip", slot: 0, title: "Le saut" };
    const html = render();
    const videos = html.match(/<video[^>]*>/g) ?? [];
    expect(videos[0]).toContain("is-visible");
    expect(videos[0]).not.toContain("is-blurred");
    expect(videos[1]).not.toContain("is-visible");
    expect(html).not.toMatch(/show-banner is-visible/);
    expect(html).toMatch(/show-title is-visible/);
    expect(html).toContain("lp-pill show-title-pill");
    expect(html).toContain("Le saut");
    expect(html).toContain("show-fox is-corner");
  });
});

// Le retour de Fenysk a sa page, `/countdown` : /show n'en dit rien à aucun temps de l'émission.
describe("le retour de Fenysk dans la page", () => {
  it("Quand l'ouverture joue, le système doit ne rien dire du retour de Fenysk", () => {
    state.view = { kind: "opening" };
    const html = render();
    expect(html).toContain('data-view="opening"');
    expect(html).not.toContain("Retour de Fenysk");
    expect(html).not.toContain("countdown");
  });

  it("Quand le carton d'un clip joue, le système doit ne rien dire du retour de Fenysk", () => {
    state.view = { kind: "card", slot: 0, title: "Le saut", day: "2026-10-16" };
    const html = render();
    expect(html).toContain('data-view="card"');
    expect(html).not.toContain("Retour de Fenysk");
    expect(html).not.toContain("countdown");
  });

  it("Quand le clip joue, le système doit ne rien dire du retour de Fenysk, le titre du coin mis à part", () => {
    state.view = { kind: "clip", slot: 0, title: "Le saut" };
    const html = render();
    expect(html).toContain("Le saut");
    expect(html).not.toContain("Retour de Fenysk");
    expect(html).not.toContain("countdown");
  });

  it("Quand la clôture joue, le système doit ne rien dire du retour de Fenysk", () => {
    state.view = { kind: "closing" };
    const html = render();
    expect(html).toContain('data-view="closing"');
    expect(html).not.toContain("Retour de Fenysk");
    expect(html).not.toContain("countdown");
  });
});

const HEAD_VIEW: HeadView = {
  width: 332,
  height: 476,
  cut: { left: { x: 61, y: 237.5 }, right: { x: 275, y: 237.5 } },
  tilt: 1,
  opening: 1,
  scale: 1,
  closing: 0,
  topHeight: 237.5,
  expression: { id: "photo", version: "1" },
  idle: { angle: 0, lift: 0 },
  mouth: { kind: "open", pose: { pivot: "left", angle: 7 } },
};

const shownHead = (): ShownHead => ({ view: HEAD_VIEW, images: toImageUrls(HEAD_VIEW.expression) });

// Le conteneur de la tête de Fenysk, tel qu'il est écrit dans la page.
const headBox = (html: string): string => html.match(/<div class="show-head[^"]*"[^>]*>/)?.[0] ?? "";

describe("la tête de Fenysk dans la page", () => {
  const ON_AIR: ShowView[] = [
    { kind: "opening" },
    { kind: "card", slot: 0, title: "Le saut", day: "2026-10-16" },
    { kind: "clip", slot: 1, title: "Le saut" },
    { kind: "closing" },
  ];

  it("Tant que le son est baissé, le système doit lever la tête à l'ouverture, au carton, pendant le clip et à la clôture", () => {
    for (const view of ON_AIR) {
      state.view = view;
      state.fader = 15;
      state.head = shownHead();
      const box = headBox(render());
      expect(box).toContain("show-head is-visible");
      expect(box).toContain('aria-hidden="false"');
    }
  });

  it("dessine la tête reçue : les deux moitiés de son expression, la bouche comme sur /head", () => {
    state.view = { kind: "clip", slot: 0, title: "Le saut" };
    state.fader = 15;
    state.head = shownHead();
    const html = render();
    expect(html).toContain("/api/expressions/photo/image/bottom?v=1");
    expect(html).toContain("/api/expressions/photo/image/top?v=1");
    expect(html).toContain("rotate(");
  });

  it("Quand le son est entier, le système doit baisser la tête : le conteneur est là, sans is-visible", () => {
    for (const view of ON_AIR) {
      state.view = view;
      state.fader = 100;
      state.head = shownHead();
      const box = headBox(render());
      expect(box).toContain('class="show-head"');
      expect(box).toContain('aria-hidden="true"');
    }
  });

  it("Quand la page est transparente, le système ne doit jamais lever la tête, même si Fenysk parle", () => {
    state.view = { kind: "none" };
    state.fader = 15;
    state.head = shownHead();
    const html = render();
    expect(html).toContain('data-view="none"');
    expect(headBox(html)).toContain('class="show-head"');
    expect(html).not.toContain("is-visible");
  });

  it("ne dessine rien tant qu'aucune vue de la tête n'est arrivée, sans erreur", () => {
    state.view = { kind: "clip", slot: 0, title: "Le saut" };
    state.fader = 15;
    const html = render();
    expect(headBox(html)).toContain("show-head is-visible");
    expect(html).not.toContain("/api/expressions/");
  });

  it("Pendant le clip, le système doit mettre la tête devant le tchat d'origine : elle vient après lui dans la page", () => {
    state.view = { kind: "clip", slot: 0, title: "Le saut" };
    state.fader = 15;
    state.head = shownHead();
    state.look = DEFAULT_CHAT_LOOK;
    const html = render();
    expect(html).toContain('class="chat-column"');
    expect(html.indexOf('class="show-head')).toBeGreaterThan(html.indexOf('class="show-chat'));
  });

  it("ne touche pas à Jean-Renard : il garde sa place, grand à droite hors du clip", () => {
    state.view = { kind: "opening" };
    state.fader = 15;
    state.head = shownHead();
    expect(render()).toContain("show-fox is-beside");
  });
});
