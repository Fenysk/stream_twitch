// Les rires pendant l'aperçu du clip dans l'éditeur : lesquels partent quand la lecture avance, lesquels sont déjà en route quand elle
// démarre ou reprend. Tout est en secondes du clip brut, comme `at`, `start` et `end`.

import { isLaughKept } from "./laugh.rules";
import { toDue } from "./show.rules";
import { STEP_SECONDS, type Trim } from "./trim.rules";

// Les rires de la partie gardée qui partent quand la lecture passe de `from` (compris) à `to` (exclu). `to` à l'infini : tous ceux pas
// encore partis, un rire posé pile à `end` compris.
export const toLaughsDue = <Laugh extends { at: number }>(
  laughs: readonly Laugh[],
  from: number,
  to: number,
  kept: Trim,
): Laugh[] =>
  toDue(
    laughs.filter(({ at }) => isLaughKept(at, kept)),
    from,
    to,
  );

// Un rire en route : son sound a commencé avant la position et n'a pas fini ; `offset` : depuis où le jouer (position − `at`).
export type UnderwayLaugh<Laugh> = { laugh: Laugh; offset: number };

// Les rires de la partie gardée déjà en route à `position`, quand la durée de leur sound est connue (`seconds`, par identifiant de sound) :
// sans elle, on ne sait pas s'ils jouent encore. Un rire qui commence pile à `position` n'y est pas : il part avec la lecture.
export const toLaughsUnderway = <Laugh extends { at: number; sound: string }>(
  laughs: readonly Laugh[],
  position: number,
  seconds: ReadonlyMap<string, number>,
  kept: Trim,
): UnderwayLaugh<Laugh>[] =>
  laughs.flatMap((laugh) => {
    const length = seconds.get(laugh.sound);
    const isUnderway =
      length !== undefined &&
      isLaughKept(laugh.at, kept) &&
      laugh.at < position &&
      position < laugh.at + length;
    return isUnderway ? [{ laugh, offset: position - laugh.at }] : [];
  });

// La position est sur la fin gardée, à deux images près : c'est là que la lecture de la sélection s'arrête, sur sa dernière image.
export const isAtKeptEnd = (position: number, kept: Trim): boolean => position >= kept.end - 2 * STEP_SECONDS;
