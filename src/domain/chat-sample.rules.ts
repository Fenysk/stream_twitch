import type { ChatFragment, ChatMessage } from "./chat.schema";

const text = (value: string): ChatFragment => ({ kind: "text", text: value });
const emote = (id: string, name: string): ChatFragment => ({ kind: "emote", id, name });

type Sample = Pick<ChatMessage, "nickname" | "color" | "fragments" | "isHidden">;

// Les messages de test de l'aperçu, dans l'ordre où ils défilent : chaque cas qui se règle y est, et les deux messages
// masqués (une commande, un bot) ne se suivent pas. Emotes globales de Twitch : 25 Kappa, 425618 LUL, 41 Kreygasm, 354 4Head,
// 64138 SeemsGood.
const SAMPLES: readonly Sample[] = [
  {
    nickname: "Fenysk_fan",
    color: "#FF4500",
    isHidden: false,
    fragments: [text("Salut le stream ! "), emote("25", "Kappa")],
  },
  {
    nickname: "BleuFonce",
    color: "#0000FF",
    isHidden: false,
    fragments: [text("Mon pseudo est bleu foncé, éclairci pour rester lisible "), emote("425618", "LUL")],
  },
  {
    nickname: "Alice",
    color: null,
    isHidden: false,
    fragments: [
      text(
        "Un message plus long, pour voir comment le texte passe à la ligne dans la colonne, et comment le fond et les emotes suivent la taille choisie, même sur trois lignes ",
      ),
      emote("25", "Kappa"),
    ],
  },
  { nickname: "Emote_Seule", color: "#9ACD32", isHidden: false, fragments: [emote("41", "Kreygasm")] },
  { nickname: "Jean_Michel", color: "#8A2BE2", isHidden: true, fragments: [text("!lurk")] },
  {
    nickname: "TripleCoup",
    color: "#1E90FF",
    isHidden: false,
    fragments: [emote("354", "4Head"), text(" "), emote("354", "4Head"), text(" "), emote("354", "4Head")],
  },
  {
    nickname: "Fan_de_feu",
    color: "#FF69B4",
    isHidden: false,
    fragments: [text("\u{1F525}\u{1F525}\u{1F525} trop fort "), emote("64138", "SeemsGood")],
  },
  {
    nickname: "NuitNoire",
    color: "#101030",
    isHidden: false,
    fragments: [text("Un pseudo presque noir, éclairci lui aussi")],
  },
  {
    nickname: "Nightbot",
    color: "#5F9EA0",
    isHidden: true,
    fragments: [text("Pensez à suivre la chaîne et à vous abonner !")],
  },
  { nickname: "Zeus_42", color: "#FFD700", isHidden: false, fragments: [text("GG !")] },
];

export const CHAT_SAMPLE_COUNT = SAMPLES.length;

// Le message de test de ce rang, en boucle sur la liste : `receivedAt` est l'instant où l'aperçu le reçoit.
export const toSampleMessage = (count: number, receivedAt: number): ChatMessage | null => {
  const sample = SAMPLES[count % SAMPLES.length];
  return sample ? { ...sample, id: `sample-${count}`, receivedAt } : null;
};
