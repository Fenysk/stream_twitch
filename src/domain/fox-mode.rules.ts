import type { FoxMode } from "./fox.schema";
import { FLIP_MS } from "./mirror.rules";
import type { Settings } from "./settings.schema";

export const IDLE_MODE: FoxMode = { kind: "idle" };
export const LISTENING_MODE: FoxMode = { kind: "listening" };

// Ce que le renard montre avant de lire : une réaction à un mot-clé, le coucou à un viewer qu'il lit pour la première fois,
// le retournement vers Fenysk (qui dure jusqu'à la fin de la phrase), le saut de joie d'un sub, le sursaut d'un cri, ou le
// bâillement d'un monologue, le sursaut du jeu, ou le long coucou d'un raid.
export type Show = Extract<
  FoxMode,
  { kind: "reaction" | "wave" | "address" | "joy" | "flinch" | "yawn" | "startle" | "raid" }
>;

export const WAVE_MODE: Show = { kind: "wave" };
export const RAID_MODE: Show = { kind: "raid" };
export const ADDRESS_MODE: Show = { kind: "address" };
export const JOY_MODE: Show = { kind: "joy" };
export const FLINCH_MODE: Show = { kind: "flinch" };
export const YAWN_MODE: Show = { kind: "yawn" };
export const STARTLE_MODE: Show = { kind: "startle" };
export const SMILE_MODE: Show = { kind: "reaction", image: "front-smile-rest" };

// Combien de temps il se montre avant que la phrase parte : la durée d'une réaction, du coucou ou du sursaut, du saut de
// joie, du bâillement ou du long coucou d'un raid, ou le retournement vers Fenysk.
export const toShowMs = (
  { kind }: Show,
  { reactionMs, joyMs, yawnMs, raidMs }: Pick<FoxModeRules, "reactionMs" | "joyMs" | "yawnMs" | "raidMs">,
): number => {
  switch (kind) {
    case "address":
      return FLIP_MS;
    case "joy":
      return joyMs;
    case "yawn":
      return yawnMs;
    case "raid":
      return raidMs;
    default:
      return reactionMs;
  }
};

// Le retournement vers Fenysk reste jusqu'à la fin de la phrase ; une réaction ou un coucou cède la place à la phrase.
export const isHeldShow = ({ kind }: Show): boolean => kind === "address";

// Tourné vers Fenysk, à droite de l'écran : toutes les images en miroir.
export const isFacingFenysk = ({ kind }: FoxMode): boolean => kind === "address" || kind === "flinch";

export const isSameMode = (first: FoxMode, second: FoxMode): boolean =>
  first.kind === second.kind &&
  (first.kind !== "reaction" || (second.kind === "reaction" && first.image === second.image));

// Le mode qui gagne, dans l'ordre du CDC : la bouche d'abord (la page la donne quand il parle), puis la réaction ou le
// coucou, puis l'écoute d'Alexis, puis le bâillement, puis rien de particulier.
export function toFoxMode({
  show,
  isTalking,
  isYawning,
}: {
  show: Show | null;
  isTalking: boolean;
  isYawning: boolean;
}): FoxMode {
  if (show) return show;
  if (isTalking) return LISTENING_MODE;
  return isYawning ? YAWN_MODE : IDLE_MODE;
}

// Les réglages de D, E, F et H, en ms, avec le threshold et le delay de la tête pour entendre Alexis.
export type FoxModeRules = {
  threshold: number;
  delay: number;
  readSilence: number;
  stopAfter: number;
  reactionMs: number;
  joyMs: number;
  yawnMs: number;
  raidMs: number;
  awayAfter: number;
  leaveMs: number;
  returnMs: number;
};

// Sans les réglages du renard (tous ou aucun), pas de modes : il reste au repos.
export function toFoxModeRules(settings: Settings): FoxModeRules | undefined {
  const {
    foxReadSilence,
    foxStopAfter,
    foxReactionDuration,
    foxJoyDuration,
    foxYawnDuration,
    foxRaidDuration,
    foxAwayAfter,
    foxCrouchDuration,
    foxJumpDuration,
    foxDiveDuration,
    foxReturnDuration,
  } = settings;
  if (
    foxReadSilence === undefined ||
    foxStopAfter === undefined ||
    foxReactionDuration === undefined ||
    foxJoyDuration === undefined ||
    foxYawnDuration === undefined ||
    foxRaidDuration === undefined ||
    foxAwayAfter === undefined ||
    foxCrouchDuration === undefined ||
    foxJumpDuration === undefined ||
    foxDiveDuration === undefined ||
    foxReturnDuration === undefined
  )
    return undefined;
  return {
    threshold: settings.threshold,
    delay: settings.delay,
    readSilence: foxReadSilence,
    stopAfter: foxStopAfter,
    reactionMs: foxReactionDuration,
    joyMs: foxJoyDuration,
    yawnMs: foxYawnDuration,
    raidMs: foxRaidDuration,
    awayAfter: foxAwayAfter,
    leaveMs: foxCrouchDuration + foxJumpDuration + foxDiveDuration,
    returnMs: foxReturnDuration,
  };
}
