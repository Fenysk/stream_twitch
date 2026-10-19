import { BOOST_PERIOD_MS, toBoost, toNextBoost, toTalkPeak } from "../domain/boost.rules";
import type { Settings } from "../domain/settings.schema";
import type { ShowSceneResult } from "./show-director.usecase";

// Les levels (dB) de toutes les entrées audio d'OBS, une lecture à la fois avec le nom de l'entrée. Infra les lit dans InputVolumeMeters.
export type LevelsPort = { subscribe(listener: (input: string, level: number) => void): () => void };

// Les filtres d'une source de caméra : prête (`boostDb` : le boost que son filtre porte déjà, 0 s'il vient d'être posé), ou pourquoi non.
export type BoostFilters = { ok: true; boostDb: number } | { ok: false; reason: string };

// OBS vu du boost ; infra l'implémente avec les filtres audio d'obs-websocket. Un refus (OBS non joint, source inconnue) est un résultat,
// jamais une exception.
export type CameraBoostPort = {
  // Pose sur la source son filtre de boost et son limiteur s'ils n'y sont pas, une seule fois : ce qui existe déjà n'est jamais écrasé (un
  // limiteur d'Alexis compris).
  createFilters(input: string): Promise<BoostFilters>;
  // Le boost (dB) du filtre de boost de la source.
  updateBoost(input: string, boostDb: number): Promise<ShowSceneResult>;
};

// Les réglages que le boost lit : le nom du mic du PC (dont le boost n'est jamais touché) et la cible des crêtes ; sans cible, rien ne monte.
export type CameraBoostSettings = Pick<Settings, "micName" | "cameraBoostTarget">;

export type CameraBoostDeps = {
  levels: LevelsPort;
  port: CameraBoostPort;
  settings: CameraBoostSettings;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

export type CameraBoost = {
  start(): void;
  stop(): void;
  // Les réglages changent : le nom du mic du PC, la cible.
  update(settings: CameraBoostSettings): void;
  // L'entrée que la tête et Jean-Renard écoutent change : le micro du live. Celle d'une caméra lance son boost, celle du PC l'arrête.
  updateLiveInput(input: string): void;
};

// Un cycle ne garde que les lectures de sa fenêtre : 2 s à une lecture toutes les 50 ms, avec de la marge.
const READINGS_MAX = 400;

const toReason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const toBoostText = (db: number): string => `${db > 0 ? "+" : ""}${db} dB`;

export function createCameraBoost({
  levels,
  port,
  settings: initial,
  schedule,
  log,
}: CameraBoostDeps): CameraBoost {
  let settings = initial;
  // La caméra dont le mic est celui du live (l'entrée d'OBS de sa source), `null` : le mic du PC, ou aucune.
  let liveInput: string | null = null;
  // Le boost de chaque caméra pour la session, et celles dont les filtres se préparent ou ont déjà été signalés en échec.
  const boosts = new Map<string, number>();
  const preparing = new Set<string>();
  const reported = new Set<string>();
  // Les levels lus sur l'entrée du live depuis le dernier cycle.
  let readings: number[] = [];
  let cancelCycle: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;

  const hear = (input: string, level: number): void => {
    if (input !== liveInput || readings.length >= READINGS_MAX) return;
    readings.push(level);
  };

  // Un échec se dit une fois par caméra : il revient à chaque cycle tant qu'OBS refuse.
  const report = (input: string, reason: string): void => {
    if (reported.has(input)) return;
    reported.add(input);
    log(`Boost : « ${input} » n'est pas prête (${reason}).`);
  };

  // Les filtres de la source se posent avant tout boost : le limiteur est là quand la voix monte. Un boost qui reste sous 0 dB dans le filtre
  // (Alexis l'a baissé à la main) est ramené à 0 : le boost ne baisse jamais la voix.
  const prepare = async (input: string): Promise<void> => {
    if (boosts.has(input) || preparing.has(input)) return;
    preparing.add(input);
    try {
      const filters = await port.createFilters(input);
      if (!filters.ok) {
        report(input, filters.reason);
        return;
      }
      const boost = toBoost(filters.boostDb);
      const fixed: ShowSceneResult =
        boost === filters.boostDb ? { ok: true } : await port.updateBoost(input, boost);
      if (!fixed.ok) {
        report(input, fixed.reason);
        return;
      }
      boosts.set(input, boost);
      reported.delete(input);
      log(`Boost : « ${input} » prête, filtres en place (${toBoostText(boost)}).`);
    } catch (error) {
      report(input, toReason(error));
    } finally {
      preparing.delete(input);
    }
  };

  // Un cycle : d'après les crêtes de la voix depuis le dernier, le boost de la caméra du live monte d'un cran, ou reste.
  const adjust = async (): Promise<void> => {
    const input = liveInput;
    const target = settings.cameraBoostTarget;
    const heard = readings;
    readings = [];
    if (input === null || target === undefined) return;
    const current = boosts.get(input);
    if (current === undefined) {
      await prepare(input);
      return;
    }
    const peak = toTalkPeak(heard, current);
    if (peak === null) return;
    const next = toNextBoost(current, peak, target);
    if (next === current) return;
    const result = await port.updateBoost(input, next);
    if (!result.ok) {
      // Le filtre a disparu d'OBS (supprimé à la main) : les filtres se reposent au cycle suivant.
      boosts.delete(input);
      log(`Boost : « ${input} » n'est pas montée à ${toBoostText(next)} (${result.reason}).`);
      return;
    }
    boosts.set(input, next);
    log(
      `Boost : « ${input} » monte de ${toBoostText(current)} à ${toBoostText(next)} (crêtes ${Math.round(peak)} dB, cible ${target} dB).`,
    );
  };

  // Le boost ne tourne que pour une caméra qui a le micro du live, avec une cible réglée : un cycle toutes les BOOST_PERIOD_MS.
  const arm = (): void => {
    cancelCycle?.();
    cancelCycle = null;
    if (unsubscribe === null || liveInput === null || settings.cameraBoostTarget === undefined) return;
    void prepare(liveInput);
    cancelCycle = schedule(() => {
      cancelCycle = null;
      void adjust().then(arm, arm);
    }, BOOST_PERIOD_MS);
  };

  return {
    start() {
      unsubscribe ??= levels.subscribe(hear);
      arm();
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      cancelCycle?.();
      cancelCycle = null;
    },
    update(next) {
      const isChanged =
        next.micName !== settings.micName || next.cameraBoostTarget !== settings.cameraBoostTarget;
      settings = next;
      if (isChanged) arm();
    },
    updateLiveInput(input) {
      const next = input === settings.micName ? null : input;
      if (next === liveInput) return;
      liveInput = next;
      readings = [];
      arm();
    },
  };
}
