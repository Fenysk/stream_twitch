import { describe, expect, it } from "vitest";
import type { ChatEvent, ChatLook, ChatMessage } from "./chat.schema";
import {
  EMPTY_PHONE_CHAT,
  isHiddenInObs,
  type PhoneChatMessage,
  type PhoneChatState,
  toNextPhoneChat,
  toPhoneChatMark,
} from "./chat-phone.rules";

const LOOK: ChatLook = {
  style: "pill",
  opacity: 85,
  textSize: 20,
  duration: 60,
  maxMessages: 8,
  animation: "rise",
  shouldShowHidden: false,
};

const message = (id: string, receivedAt: number, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  nickname: "Alice",
  color: null,
  fragments: [{ kind: "text", text: `message ${id}` }],
  isHidden: false,
  receivedAt,
  ...overrides,
});

const entry = (id: string, receivedAt: number, isDeleted = false): PhoneChatMessage => ({
  message: message(id, receivedAt),
  isDeleted,
});

const stateOf = (...entries: PhoneChatMessage[]): PhoneChatState => ({ messages: entries, look: LOOK });

const ids = (state: PhoneChatState): string[] => state.messages.map(({ message: { id } }) => id);

const send = (state: PhoneChatState, ...events: ChatEvent[]): PhoneChatState =>
  events.reduce(toNextPhoneChat, state);

describe("toNextPhoneChat : les messages", () => {
  it("ajoute chaque message en bas, du plus ancien au plus récent, sans en retirer aucun", () => {
    const state = send(
      EMPTY_PHONE_CHAT,
      { kind: "message", message: message("a", 1) },
      { kind: "message", message: message("b", 2) },
    );
    expect(ids(state)).toEqual(["a", "b"]);
    expect(state.messages.every(({ isDeleted }) => !isDeleted)).toBe(true);
  });

  it("garde tout ce qui arrive : pas de maximum, pas de durée de vie", () => {
    let state = EMPTY_PHONE_CHAT;
    for (let count = 0; count < 1000; count += 1) {
      state = toNextPhoneChat(state, { kind: "message", message: message(`m${count}`, count) });
    }
    expect(state.messages).toHaveLength(1000);
    expect(ids(state)[0]).toBe("m0");
    expect(ids(state).at(-1)).toBe("m999");
  });

  it("ne remet pas un message qu'il a déjà", () => {
    const state = stateOf(entry("a", 1));
    expect(toNextPhoneChat(state, { kind: "message", message: message("a", 1) })).toBe(state);
  });

  it("garde un message masqué dans OBS (commande, bot) : il vient comme les autres", () => {
    const state = send(EMPTY_PHONE_CHAT, {
      kind: "message",
      message: message("a", 1, { isHidden: true }),
    });
    expect(state.messages[0]?.message.isHidden).toBe(true);
  });
});

describe("toNextPhoneChat : les suppressions", () => {
  it("garde le message supprimé, marqué supprimé, à sa place, au lieu de le retirer", () => {
    const state = send(stateOf(entry("a", 1), entry("b", 2), entry("c", 3)), {
      kind: "delete",
      messageIds: ["b"],
    });
    expect(ids(state)).toEqual(["a", "b", "c"]);
    expect(state.messages.map(({ isDeleted }) => isDeleted)).toEqual([false, true, false]);
  });

  it("marque tous les messages d'un viewer banni ou en timeout, que le serveur donne ensemble", () => {
    const state = send(stateOf(entry("a", 1), entry("b", 2), entry("c", 3)), {
      kind: "delete",
      messageIds: ["a", "c"],
    });
    expect(state.messages.map(({ isDeleted }) => isDeleted)).toEqual([true, false, true]);
  });

  it("ignore une suppression de messages qu'il n'a pas, et ne change rien à ceux qu'il a", () => {
    const state = stateOf(entry("a", 1));
    const next = send(state, { kind: "delete", messageIds: ["inconnu"] });
    expect(next.messages).toEqual(state.messages);
  });
});

describe("toNextPhoneChat : le snapshot du serveur", () => {
  it("prend l'allure et les messages du serveur à la première connexion", () => {
    const state = send(EMPTY_PHONE_CHAT, {
      kind: "snapshot",
      messages: [message("a", 1), message("b", 2)],
      look: LOOK,
    });
    expect(ids(state)).toEqual(["a", "b"]);
    expect(state.look).toEqual(LOOK);
  });

  it("garde à la reconnexion ce que le téléphone avait et que le serveur a oublié (plus ancien que tout ce qu'il garde)", () => {
    const state = send(stateOf(entry("a", 1), entry("b", 2), entry("c", 3)), {
      kind: "snapshot",
      messages: [message("c", 3), message("d", 4)],
      look: LOOK,
    });
    expect(ids(state)).toEqual(["a", "b", "c", "d"]);
    expect(state.messages.map(({ isDeleted }) => isDeleted)).toEqual([false, false, false, false]);
  });

  it("marque supprimé, à la reconnexion, un message que le serveur ne garde plus alors qu'il garde des messages plus anciens que lui", () => {
    const state = send(stateOf(entry("a", 1), entry("b", 2), entry("c", 3)), {
      kind: "snapshot",
      messages: [message("a", 1), message("c", 3)],
      look: LOOK,
    });
    expect(state.messages.map(({ message: { id }, isDeleted }) => [id, isDeleted])).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
  });

  it("garde un message déjà supprimé supprimé, et ajoute à la bonne place ceux qui sont arrivés pendant la coupure", () => {
    const state = send(stateOf(entry("a", 1, true), entry("c", 3)), {
      kind: "snapshot",
      messages: [message("a", 1), message("b", 2), message("c", 3)],
      look: LOOK,
    });
    expect(state.messages.map(({ message: { id }, isDeleted }) => [id, isDeleted])).toEqual([
      ["a", true],
      ["b", false],
      ["c", false],
    ]);
  });

  it("ne marque rien supprimé quand le serveur n'a aucun message (il vient de démarrer) : il ne sait rien des anciens", () => {
    const state = send(stateOf(entry("a", 1), entry("b", 2)), { kind: "snapshot", messages: [], look: LOOK });
    expect(state.messages.map(({ isDeleted }) => isDeleted)).toEqual([false, false]);
  });
});

describe("toNextPhoneChat : l'allure", () => {
  it("change l'allure sans toucher aux messages", () => {
    const state = stateOf(entry("a", 1));
    const next = send(state, { kind: "look", look: { ...LOOK, shouldShowHidden: true } });
    expect(next.look?.shouldShowHidden).toBe(true);
    expect(next.messages).toBe(state.messages);
  });
});

describe("isHiddenInObs", () => {
  it("dit masqué dans OBS une commande ou un bot, quand le réglage du tchat ne les montre pas", () => {
    expect(isHiddenInObs(message("a", 1, { isHidden: true }), LOOK)).toBe(true);
    expect(isHiddenInObs(message("a", 1), LOOK)).toBe(false);
  });

  it("ne dit pas masqué ce qu'OBS montre : le réglage les montre", () => {
    expect(isHiddenInObs(message("a", 1, { isHidden: true }), { ...LOOK, shouldShowHidden: true })).toBe(
      false,
    );
  });

  it("masque par défaut tant que le serveur n'a pas donné l'allure", () => {
    expect(isHiddenInObs(message("a", 1, { isHidden: true }), null)).toBe(true);
  });
});

describe("toPhoneChatMark", () => {
  it("marque supprimé un message supprimé, même s'il était aussi masqué dans OBS", () => {
    const hidden = { message: message("a", 1, { isHidden: true }), isDeleted: true };
    expect(toPhoneChatMark(hidden, LOOK)).toBe("deleted");
    expect(toPhoneChatMark(entry("b", 2, true), LOOK)).toBe("deleted");
  });

  it("marque masqué un message que seul le téléphone montre, et rien pour un message qu'OBS montre aussi", () => {
    expect(toPhoneChatMark({ message: message("a", 1, { isHidden: true }), isDeleted: false }, LOOK)).toBe(
      "hidden",
    );
    expect(toPhoneChatMark(entry("b", 2), LOOK)).toBeNull();
    expect(
      toPhoneChatMark(
        { message: message("a", 1, { isHidden: true }), isDeleted: false },
        {
          ...LOOK,
          shouldShowHidden: true,
        },
      ),
    ).toBeNull();
  });
});
