import type { RawMessage } from "../domain/chat.types";
import { type InsultList, toInsultMatch } from "../domain/chat-insults.rules";
import { toTextWithoutCheermotes } from "../domain/cheermote.rules";
import {
  BURST_START,
  type FollowBurst,
  toBurstAfterFollow,
  toBurstAfterGap,
  toGroupDueIn,
} from "../domain/follow-burst.rules";
import { JOY_MODE, SMILE_MODE } from "../domain/fox-mode.rules";
import type { LiveEvent } from "../domain/live.types";
import { isFillable, toFilledPhrase } from "../domain/phrase.rules";
import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import {
  isLurk,
  type ThanksKey,
  type ThanksRules,
  type ThanksSubject,
  toThanksPlan,
  toThanksRules,
} from "../domain/thanks.rules";
import type { Chat } from "./chat.usecase";
import type { FoxChat } from "./fox-chat.usecase";
import type { FoxJab } from "./fox-jab.usecase";
import type { FoxQueue } from "./fox-queue.usecase";
import type { Viewers } from "./viewers.usecase";

export type FoxThanksDeps = {
  chat: Pick<Chat, "subscribeSource">;
  queue: Pick<FoxQueue, "push">;
  foxChat: Pick<FoxChat, "speakAttached">;
  viewers: Pick<Viewers, "getCount">;
  // Un remerciement est quelque chose qui se passe dans le live : le silence de la relance repart.
  jab: Pick<FoxJab, "noteActivity">;
  settings: Settings;
  insults: InsultList;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  random: () => number;
  log: (message: string) => void;
};

export type FoxThanks = {
  // Le renard écoute les subs, resubs, subs offerts et cheers du tchat.
  start(): void;
  stop(): void;
  update(settings: Settings): void;
  // Un évènement du live, d'où qu'il vienne (le tchat, ou EventSub pour les follows) : le renard le remercie.
  receive(event: LiveEvent): void;
};

// Le nom de chaque sorte d'évènement dans le journal.
const SUBJECT_TEXTS: Record<ThanksSubject["kind"], string> = {
  follow: "follow",
  "follow-group": "follows groupés",
  sub: "sub",
  gift: "sub offert",
  "mystery-gift": "série de subs offerts",
  cheer: "cheer",
  lurk: "lurk",
};

const toEmptySaid = (): Record<ThanksKey, string[]> => ({
  foxThanksFollow: [],
  foxThanksFollowGeneric: [],
  foxThanksSub: [],
  foxThanksGiftOne: [],
  foxThanksGiftMany: [],
  foxThanksCheer: [],
  foxThanksLurk: [],
  foxThanksLurkGeneric: [],
});

// Le message qui accompagne l'évènement, prêt à passer le filtre : un cheer n'y garde pas ses cheermotes (« Cheer100 »).
// Rien à lire quand il ne reste que des cheermotes.
const toAttachedMessage = (event: LiveEvent): RawMessage | null => {
  if (event.kind !== "sub" && event.kind !== "cheer") return null;
  const { message } = event;
  if (message === null || event.kind === "sub") return message;
  const text = toTextWithoutCheermotes(message.text);
  return text.trim() === "" ? null : { ...message, text };
};

// Les remerciements : un évènement du live (follow, sub, resub, sub offert, cheer) donne une phrase tirée au hasard dans la
// liste de son espèce, qui passe devant les messages de la file. Elle attend le silence de Fenysk mais sa voix ne la coupe
// pas. Les follows en rafale ne sont remerciés nominativement qu'un par délai, les autres sont regroupés en une phrase. Un
// message du tchat dont le premier mot est « !lurk » est remercié de même, une fois par viewer depuis le démarrage du serveur.
export function createFoxThanks({
  chat,
  queue,
  foxChat,
  viewers,
  jab,
  settings: initial,
  insults,
  clock,
  schedule,
  random,
  log,
}: FoxThanksDeps): FoxThanks {
  let rules: ThanksRules | undefined = toThanksRules(initial);
  let burst: FollowBurst = BURST_START;
  let cancelGroup: (() => void) | undefined;
  // Les viewers déjà remerciés d'un lurk depuis le démarrage du serveur.
  const lurkers = new Set<string>();
  // Les phrases déjà dites de chaque liste depuis son dernier tour : pas de répétition avant d'avoir tout dit.
  const said = toEmptySaid();
  let unsubscribe: (() => void) | undefined;

  const thank = (subject: ThanksSubject, attached: RawMessage | null) => {
    if (!rules) return;
    let hasRefusedName = false;
    const plan = toThanksPlan(subject, {
      isRefused: (name) => {
        const isRefused = toInsultMatch(name, insults) !== null;
        hasRefusedName ||= isRefused;
        return isRefused;
      },
      viewers: viewers.getCount(),
    });
    // Une phrase dont une variable n'a pas de valeur (`{viewers}` sans live) ne se tire pas.
    const candidates = rules.phrases[plan.list].filter((phrase) => isFillable(phrase, plan.values));
    const pick = toNextPick(candidates, said[plan.list], random);
    const name = SUBJECT_TEXTS[subject.kind];
    if (!pick) {
      log(`Renard : aucune phrase de remerciement possible pour ${name}, rien n'est dit.`);
      return;
    }
    said[plan.list] = pick.said;
    const text = toFilledPhrase(pick.phrase, plan.values);
    if (hasRefusedName) log(`Renard : pseudo refusé par le filtre d'insultes (${name}), il n'est pas dit.`);
    log(`Renard : remerciement (${name}) : « ${text} »`);
    jab.noteActivity();
    queue.push({
      kind: "thanks",
      label: `remerciement (${name})`,
      text,
      isCuttable: false,
      isUrgent: true,
      toShow: () => (plan.show === "joy" ? JOY_MODE : SMILE_MODE),
    });
    // Le message joint se lit juste après le remerciement, s'il passe le filtre.
    if (attached) foxChat.speakAttached(attached);
  };

  const resetBurst = () => {
    cancelGroup?.();
    cancelGroup = undefined;
    burst = BURST_START;
  };

  // La phrase groupée est due à la fin du délai du dernier remerciement nominatif ; si un autre est passé entre-temps,
  // elle attend la fin de son délai.
  const flushGroup = () => {
    cancelGroup = undefined;
    if (!rules) return;
    const dueIn = toGroupDueIn(burst, clock(), rules.gap);
    if (dueIn !== null && dueIn > 0) {
      cancelGroup = schedule(flushGroup, dueIn);
      return;
    }
    const step = toBurstAfterGap(burst);
    burst = step.burst;
    if (step.say === "group") thank({ kind: "follow-group" }, null);
  };

  const receiveFollow = (event: Extract<LiveEvent, { kind: "follow" }>, { gap }: ThanksRules) => {
    const now = clock();
    const step = toBurstAfterFollow(burst, now, gap);
    burst = step.burst;
    if (step.say === "named") {
      thank(event, null);
      return;
    }
    const dueIn = toGroupDueIn(burst, now, gap);
    if (!cancelGroup && dueIn !== null) cancelGroup = schedule(flushGroup, dueIn);
  };

  const receive = (event: LiveEvent) => {
    if (!rules?.shouldThank) return;
    if (event.kind === "follow") receiveFollow(event, rules);
    else thank(event, toAttachedMessage(event));
  };

  // Le premier « !lurk » d'un viewer : un remerciement comme un follow. La commande, elle, n'est jamais lue.
  const receiveMessage = ({ viewerId, nickname, text }: RawMessage) => {
    if (!rules?.shouldThank || !isLurk(text) || lurkers.has(viewerId)) return;
    lurkers.add(viewerId);
    thank({ kind: "lurk", user: nickname }, null);
  };

  return {
    start() {
      unsubscribe ??= chat.subscribeSource((event) => {
        if (event.kind === "live") receive(event.event);
        else if (event.kind === "message") receiveMessage(event.message);
      });
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      resetBurst();
    },
    update(next) {
      rules = toThanksRules(next);
      if (!rules?.shouldThank) resetBurst();
    },
    receive,
  };
}
