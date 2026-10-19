import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatLook, ChatMessage } from "../../domain/chat.schema";
import { EMPTY_PHONE_CHAT, type PhoneChatMessage, type PhoneChatState } from "../../domain/chat-phone.rules";
import { ChatLog } from "./chat-log";
import { ControlChat } from "./control-chat";

const LOOK: ChatLook = {
  style: "pill",
  opacity: 85,
  textSize: 20,
  duration: 60,
  maxMessages: 8,
  animation: "rise",
  shouldShowHidden: false,
};

const entry = (
  id: string,
  text: string,
  overrides: Partial<ChatMessage> = {},
  isDeleted = false,
): PhoneChatMessage => ({
  message: {
    id,
    nickname: `viewer-${id}`,
    color: null,
    fragments: [{ kind: "text", text }],
    isHidden: false,
    receivedAt: 1000,
    ...overrides,
  },
  isDeleted,
});

const render = (messages: PhoneChatMessage[], look: ChatLook | null = LOOK) =>
  renderToStaticMarkup(<ChatLog state={{ messages, look } satisfies PhoneChatState} />);

describe("ChatLog", () => {
  it("montre tous les messages du plus ancien en haut au plus récent en bas, sans en limiter le nombre", () => {
    const messages = Array.from({ length: 300 }, (_, index) => entry(`m${index}`, `texte ${index}`));
    const html = render(messages);
    expect(html.match(/<li /g)).toHaveLength(300);
    expect(html.indexOf("texte 0<")).toBeLessThan(html.indexOf("texte 1<"));
    expect(html.indexOf("texte 298<")).toBeLessThan(html.indexOf("texte 299<"));
  });

  it("écrit le nickname, le texte et l'emote en image, comme la ligne d'OBS", () => {
    const html = render([
      entry("a", "", {
        fragments: [
          { kind: "text", text: "Salut " },
          { kind: "emote", id: "25", name: "Kappa" },
        ],
      }),
    ]);
    expect(html).toContain("viewer-a");
    expect(html).toContain("Salut ");
    expect(html).toContain('alt="Kappa"');
  });

  it("n'attenue ni ne marque un message qu'OBS montre aussi", () => {
    const html = render([entry("a", "bonjour")]);
    expect(html).not.toContain("data-mark");
    expect(html).not.toContain("masqué dans OBS");
    expect(html).not.toContain("supprimé");
  });

  it("garde un message masqué dans OBS (bot, commande), atténué et sans texte de plus : rien n'est censuré", () => {
    const html = render([entry("a", "!commande", { isHidden: true })]);
    expect(html).toContain("!commande");
    expect(html).toContain('data-mark="hidden"');
    expect(html).not.toContain("masqué dans OBS");
    expect(html).not.toContain("chat-log-mark");
    expect(html).not.toContain("supprimé");
  });

  it("ne dit pas « masqué dans OBS » quand le réglage du tchat montre aussi les commandes et les bots dans OBS", () => {
    const html = render([entry("a", "!commande", { isHidden: true })], { ...LOOK, shouldShowHidden: true });
    expect(html).toContain("!commande");
    expect(html).not.toContain("data-mark");
  });

  it("garde un message supprimé à sa place, barré et atténué, avec « supprimé », au lieu de le retirer", () => {
    const html = render([
      entry("a", "avant"),
      entry("b", "supprimé par un modo", {}, true),
      entry("c", "après"),
    ]);
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html).toContain('data-mark="deleted"');
    expect(html.indexOf("avant")).toBeLessThan(html.indexOf("supprimé par un modo"));
    expect(html.indexOf("supprimé par un modo")).toBeLessThan(html.indexOf("après"));
    expect(html).toMatch(/data-mark="deleted"[^>]*>(?:(?!<\/li>)[\s\S])*>supprimé</);
  });

  it("dit « supprimé » plutôt que masqué pour un message qui est les deux", () => {
    const html = render([entry("a", "!x", { isHidden: true }, true)]);
    expect(html).toContain('data-mark="deleted"');
    expect(html).not.toContain('data-mark="hidden"');
    expect(html).toMatch(/>supprimé</);
  });

  it("n'a aucune rangée sans message, et une zone qui défile avec le rôle d'un journal", () => {
    const html = renderToStaticMarkup(<ChatLog state={EMPTY_PHONE_CHAT} />);
    expect(html).not.toContain("<li");
    expect(html).toContain('role="log"');
    expect(html).toContain("chat-log-scroll");
  });

  it("n'affiche pas « Nouveaux messages » à l'ouverture : on est en bas", () => {
    expect(render([entry("a", "bonjour")])).not.toContain("Nouveaux messages");
  });
});

describe("ControlChat", () => {
  it("met le tchat du téléphone avec le bouton « Écrire » dans sa boîte, sans le tchat d'OBS", () => {
    const html = renderToStaticMarkup(<ControlChat />);
    expect(html).toContain("chat-log");
    expect(html).toContain("Écrire");
    expect(html).not.toContain("chat-column");
    expect(html.indexOf("chat-log")).toBeLessThan(html.indexOf("Écrire"));
    expect(html.indexOf("Écrire")).toBeLessThan(html.indexOf("</div></section>"));
  });
});
