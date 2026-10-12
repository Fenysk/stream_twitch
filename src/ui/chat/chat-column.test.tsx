import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatLook, ChatMessage } from "../../domain/chat.schema";
import type { ChatRow } from "../../domain/chat-rows.rules";
import { ChatRows } from "./chat-column";

const look: ChatLook = {
  style: "pill",
  opacity: 85,
  textSize: 20,
  duration: 60,
  maxMessages: 8,
  animation: "rise",
  shouldShowHidden: false,
};

const message = (id: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  nickname: "Alice",
  color: "#1E90FF",
  fragments: [
    { kind: "text", text: "Salut " },
    { kind: "emote", id: "25", name: "Kappa" },
  ],
  isHidden: false,
  receivedAt: 1000,
  ...overrides,
});

const row = (id: string, leftAt: number | null = null, overrides: Partial<ChatMessage> = {}): ChatRow => ({
  message: message(id, overrides),
  leftAt,
});

const render = (rows: ChatRow[], overrides: Partial<ChatLook> = {}) =>
  renderToStaticMarkup(<ChatRows rows={rows} look={{ ...look, ...overrides }} layout="screen" />);

describe("ChatRows : un message", () => {
  it("montre le nickname, le texte, et l'emote en image sur le CDN de Twitch, nommée par son texte", () => {
    const html = render([row("a")]);
    expect(html).toContain(">Alice</span>");
    expect(html).toContain("Salut ");
    expect(html).toContain('src="https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0"');
    expect(html).toContain('alt="Kappa"');
  });

  it("garde la couleur du viewer quand elle se lit sur le fond", () => {
    expect(render([row("a")])).toContain('style="color:#1E90FF"');
  });

  it("éclaircit une couleur illisible, et laisse la couleur par défaut à qui n'en a pas", () => {
    const html = render([row("a", null, { color: "#0000FF" }), row("b", null, { color: null })]);
    expect(html).not.toContain("#0000FF");
    expect(html.match(/style="color:#[0-9a-f]{6}"/g)).toHaveLength(1);
    expect(html.match(/class="chat-nickname">/g)).toHaveLength(1);
  });
});

describe("ChatRows : la colonne", () => {
  it("pose l'allure sur la colonne : style, taille, opacité, et toujours les tokens sombres", () => {
    const html = render([row("a")], { opacity: 40, textSize: 28 });
    expect(html).toContain('data-appearance="dark"');
    expect(html).toContain('data-style="pill"');
    expect(html).toContain("--pill-opacity:40%");
    expect(html).toContain("--chat-size:28px");
  });

  it("met chaque message dans une pill du design system, dans le style pill", () => {
    const html = render([row("a"), row("b")]);
    expect(html.match(/class="chat-line lp-pill /g)).toHaveLength(2);
    expect(html).not.toContain("chat-panel lp-pill");
  });

  it("met la colonne entière dans un panneau (une pill), et les messages sans pill, dans le style panneau", () => {
    const html = render([row("a")], { style: "panel" });
    expect(html).toContain('class="chat-panel lp-pill"');
    expect(html).not.toContain("chat-line lp-pill");
  });

  it("ne met aucune pill dans le style texte seul", () => {
    const html = render([row("a")], { style: "text" });
    expect(html).toContain('data-style="text"');
    expect(html).not.toContain("lp-pill");
  });

  it("donne à chaque animation sa classe, dont le fondu discret du design system", () => {
    expect(render([row("a")], { animation: "rise" })).toContain("chat-in-rise");
    expect(render([row("a")], { animation: "pop" })).toContain("chat-in-pop");
    expect(render([row("a")], { animation: "side" })).toContain("chat-in-side");
    expect(render([row("a")], { animation: "fade" })).toContain("lp-arrives");
  });

  it("marque la rangée d'un message qui part, et elle seule", () => {
    const html = render([row("a", 5000), row("b")]);
    expect(html.match(/data-leaving/g)).toHaveLength(1);
  });

  it("se déclare vide sans message : le panneau s'efface", () => {
    expect(render([])).toContain("data-empty");
    expect(render([row("a")])).not.toContain("data-empty");
  });
});
