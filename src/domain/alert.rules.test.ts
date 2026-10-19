import { describe, expect, it } from "vitest";
import {
  ALERT_DELAY_MS,
  ALERT_KINDS,
  ALERT_STOP_ASKED_MS,
  type AlertFacts,
  type AlertKind,
  isStopAsked,
  toAlert,
  toAlertDelay,
  toAlertSince,
  toAwayMic,
  toPlanMemory,
  toReopenMicId,
  toStopMemory,
} from "./alert.rules";
import type { ControlMic } from "./control.schema";
import type { PhoneRole } from "./phone.schema";
import { IDLE_STANDING, type PictureStanding } from "./picture.schema";

// Les faits d'un téléphone : seuls ceux qu'on dit sont vrais.
const factsOf = (...on: AlertKind[]): AlertFacts => ({
  lost: on.includes("lost"),
  stopped: on.includes("stopped"),
  unlinked: on.includes("unlinked"),
  muted: on.includes("muted"),
  "camera-stopped": on.includes("camera-stopped"),
  "camera-ready": on.includes("camera-ready"),
  "mic-away": on.includes("mic-away"),
});

// Tout est vrai depuis l'instant 0 : à l'instant 10 s, toutes les alertes durent depuis assez longtemps.
const ALL_SINCE = {
  lost: 0,
  stopped: 0,
  unlinked: 0,
  muted: 0,
  "camera-stopped": 0,
  "camera-ready": 0,
  "mic-away": 0,
};
const LATER = 10_000;

// Les alertes que ce rôle montre, dans l'ordre où elles passent quand on lève la plus prioritaire à chaque tour.
const toShownOrder = (role: PhoneRole): AlertKind[] => {
  const shown: AlertKind[] = [];
  const remaining: AlertKind[] = [...ALERT_KINDS];
  for (let turn = 0; turn < ALERT_KINDS.length; turn += 1) {
    const next = toAlert(role, factsOf(...remaining), ALL_SINCE, LATER);
    if (next === null) break;
    shown.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return shown;
};

describe("toAlert : quelle alerte montrer", () => {
  it("Quand tout va bien, le système ne doit montrer aucune alerte, quel que soit le rôle", () => {
    for (const role of ["control", "selfie", "camera"] satisfies PhoneRole[]) {
      expect(toAlert(role, factsOf(), {}, LATER)).toBeNull();
    }
  });

  it("ne montre une alerte que depuis 3 s : rien à 2,999 s, elle à 3 s", () => {
    expect(ALERT_DELAY_MS).toBe(3000);
    for (const kind of ALERT_KINDS.filter((candidate) => candidate !== "stopped")) {
      expect(toAlert("selfie", factsOf(kind), { [kind]: 1000 }, 1000 + ALERT_DELAY_MS - 1)).toBeNull();
      expect(toAlert("selfie", factsOf(kind), { [kind]: 1000 }, 1000 + ALERT_DELAY_MS)).toBe(kind);
    }
  });

  it("montre « Live arrêté » tout de suite, sans attendre 3 s", () => {
    expect(toAlert("control", factsOf("stopped"), { stopped: 5000 }, 5000)).toBe("stopped");
    expect(toAlert("selfie", factsOf("stopped"), {}, 5000)).toBe("stopped");
  });

  it("tient pour récente une condition vraie sans date : elle vient de commencer", () => {
    expect(toAlert("control", factsOf("unlinked"), {}, 5000)).toBeNull();
  });

  it("garde l'ordre de priorité : connexion perdue, live arrêté, OBS non joint, muet, caméra arrêtée, caméra prête, micro ailleurs", () => {
    expect(toShownOrder("selfie")).toEqual([
      "lost",
      "stopped",
      "unlinked",
      "muted",
      "camera-stopped",
      "camera-ready",
      "mic-away",
    ]);
  });

  it("ne montre à la Régie que connexion perdue, live arrêté, OBS non joint et muet", () => {
    expect(toShownOrder("control")).toEqual(["lost", "stopped", "unlinked", "muted"]);
  });

  it("ne montre à la Caméra que connexion perdue puis « Ta caméra est prête » : l'avis de caméra arrêtée couvre déjà son aperçu", () => {
    expect(toShownOrder("camera")).toEqual(["lost", "camera-ready"]);
  });

  it("réserve « Ta caméra s'est arrêtée » et « Le micro est au PC » au Selfie", () => {
    expect(toAlert("selfie", factsOf("camera-stopped"), ALL_SINCE, LATER)).toBe("camera-stopped");
    expect(toAlert("selfie", factsOf("mic-away"), ALL_SINCE, LATER)).toBe("mic-away");
    expect(toAlert("control", factsOf("camera-stopped", "mic-away"), ALL_SINCE, LATER)).toBeNull();
  });

  it("laisse une alerte qui dure passer devant une plus prioritaire qui vient de commencer, sans rien montrer entre deux", () => {
    const since = { lost: LATER - 500, muted: 0 };
    expect(toAlert("selfie", factsOf("lost", "muted"), since, LATER)).toBe("muted");
    expect(toAlert("selfie", factsOf("lost", "muted"), since, LATER + 2500)).toBe("lost");
  });
});

describe("toAlertSince : depuis quand chaque condition est vraie", () => {
  it("date de maintenant une condition qui devient vraie, et garde la date de celle qui l'était déjà", () => {
    const first = toAlertSince({}, factsOf("muted"), 1000);
    expect(first).toEqual({ muted: 1000 });
    expect(toAlertSince(first, factsOf("muted", "lost"), 4000)).toEqual({ muted: 1000, lost: 4000 });
  });

  it("oublie une condition qui cesse, et repart de zéro si elle revient", () => {
    const first = toAlertSince({}, factsOf("muted"), 1000);
    const gone = toAlertSince(first, factsOf(), 2000);
    expect(gone).toEqual({});
    expect(toAlertSince(gone, factsOf("muted"), 9000)).toEqual({ muted: 9000 });
  });

  it("rend le même objet quand rien ne change, pour ne pas redessiner", () => {
    const first = toAlertSince({}, factsOf("unlinked"), 1000);
    expect(toAlertSince(first, factsOf("unlinked"), 2000)).toBe(first);
  });
});

describe("toAlertDelay : dans combien de temps la prochaine alerte se montre", () => {
  it("rend le temps qui manque à la condition en attente, 3 s au départ puis de moins en moins", () => {
    expect(toAlertDelay("selfie", factsOf("muted"), { muted: 1000 }, 1000)).toBe(ALERT_DELAY_MS);
    expect(toAlertDelay("selfie", factsOf("muted"), { muted: 1000 }, 3500)).toBe(500);
    expect(toAlertDelay("selfie", factsOf("muted"), {}, 7000)).toBe(ALERT_DELAY_MS);
  });

  it("rend la plus proche quand plusieurs attendent, et rien quand toutes sont montrables ou absentes", () => {
    expect(toAlertDelay("selfie", factsOf("muted", "lost"), { muted: 1000, lost: 2000 }, 2500)).toBe(1500);
    expect(toAlertDelay("selfie", factsOf("muted"), { muted: 0 }, 3000)).toBeNull();
    expect(toAlertDelay("selfie", factsOf(), {}, 3000)).toBeNull();
  });

  it("n'attend ni « Live arrêté », immédiat, ni une alerte qui n'est pas celle du rôle", () => {
    expect(toAlertDelay("selfie", factsOf("stopped"), {}, 3000)).toBeNull();
    expect(toAlertDelay("camera", factsOf("muted", "mic-away"), {}, 3000)).toBeNull();
  });
});

describe("toStopMemory : le live s'est-il arrêté sans que ce téléphone l'ait demandé ?", () => {
  const live = { wasLive: true, isStopped: false };

  it("Quand le live passe à hors ligne sans appui sur « Arrêter » ici, le système doit retenir qu'il s'est arrêté", () => {
    expect(toStopMemory(live, false, false)).toEqual({ wasLive: false, isStopped: true });
  });

  it("oublie l'arrêt que ce téléphone a demandé (appui sur « Arrêter » dans les 30 dernières secondes)", () => {
    expect(toStopMemory(live, false, true)).toEqual({ wasLive: false, isStopped: false });
  });

  it("garde l'arrêt retenu tant que le live reste hors ligne, et l'oublie quand il repart", () => {
    const stopped = toStopMemory(live, false, false);
    expect(toStopMemory(stopped, false, false).isStopped).toBe(true);
    expect(toStopMemory(stopped, true, false)).toEqual({ wasLive: true, isStopped: false });
  });

  it("ne retient rien d'un live qui n'a jamais été en cours", () => {
    expect(toStopMemory({ wasLive: false, isStopped: false }, false, false).isStopped).toBe(false);
  });

  it("compte l'arrêt demandé ici jusqu'à 30 s après l'appui, pas au-delà", () => {
    expect(ALERT_STOP_ASKED_MS).toBe(30_000);
    expect(isStopAsked(null, 100_000)).toBe(false);
    expect(isStopAsked(10_000, 10_000 + ALERT_STOP_ASKED_MS)).toBe(true);
    expect(isStopAsked(10_000, 10_000 + ALERT_STOP_ASKED_MS + 1)).toBe(false);
  });
});

describe("toPlanMemory : ce téléphone avait-il le plan quand sa caméra s'est arrêtée ?", () => {
  const own: PictureStanding = { hasPlace: true, isCurrent: true, shown: "Caméra 1" };
  const head: PictureStanding = { hasPlace: true, isCurrent: false, shown: "Tête" };
  const none = { wasCurrent: false, isPlanLost: false };
  // La caméra tourne avec le plan, s'arrête, puis le serveur replie le plan sur la Tête.
  const lost = toPlanMemory(toPlanMemory(toPlanMemory(none, true, own), false, own), false, head);

  it("Quand la caméra s'arrête alors que ce téléphone a le plan, le système doit retenir qu'il l'avait, même après le repli sur la Tête", () => {
    const stopped = toPlanMemory(toPlanMemory(none, true, own), false, own);
    expect(stopped.isPlanLost).toBe(true);
    expect(lost.isPlanLost).toBe(true);
    expect(toPlanMemory(lost, true, head).isPlanLost).toBe(true);
  });

  it("oublie la perte dès que ce téléphone a de nouveau le plan", () => {
    expect(toPlanMemory(lost, true, own).isPlanLost).toBe(false);
  });

  it("oublie la perte quand le plan va ailleurs que sur la Tête : le choix est volontaire", () => {
    expect(toPlanMemory(lost, true, { hasPlace: true, isCurrent: false, shown: "PC" }).isPlanLost).toBe(
      false,
    );
  });

  it("ne retient rien quand la caméra n'avait pas le plan, ni quand le téléphone la cache lui-même (« Cacher »)", () => {
    const hidden = toPlanMemory(toPlanMemory(none, true, own), true, head);
    expect(hidden.isPlanLost).toBe(false);
    expect(toPlanMemory(hidden, false, head).isPlanLost).toBe(false);
    expect(toPlanMemory(none, false, IDLE_STANDING).isPlanLost).toBe(false);
  });

  it("ne retient pas non plus une coupure brève qui n'a pas touché au plan (changement de caméra)", () => {
    const switching = toPlanMemory(toPlanMemory(none, true, own), false, own);
    expect(toPlanMemory(switching, true, own).isPlanLost).toBe(false);
  });

  it("rend la même mémoire quand rien ne change, pour ne pas redessiner", () => {
    expect(toPlanMemory(none, true, head)).toBe(none);
  });
});

describe("toReopenMicId et toAwayMic : les micros", () => {
  const mic = (id: string, isOpen: boolean, isAvailable = true): ControlMic => ({
    id,
    label: id === "pc" ? "Micro du PC" : `Caméra ${id.slice(-1)}`,
    isOpen,
    isAvailable,
  });
  const mics = [mic("pc", false), mic("camera-1", false), mic("camera-2", false, false)];
  const holding: PictureStanding = { hasPlace: true, isCurrent: true, shown: "Caméra 1" };

  it("Quand « Rallumer » se presse, le système doit rouvrir le dernier micro vu ouvert s'il est encore là, sinon le PC", () => {
    expect(toReopenMicId(mics, "camera-1")).toBe("camera-1");
    expect(toReopenMicId(mics, "camera-9")).toBe("pc");
    expect(toReopenMicId(mics, "camera-2")).toBe("pc");
    expect(toReopenMicId(mics, null)).toBe("pc");
    expect(toReopenMicId([], "camera-1")).toBe("pc");
  });

  it("rend le micro entendu quand ce téléphone a le plan et que ce n'est pas le sien", () => {
    const heard = [mic("pc", true), mic("camera-1", false)];
    expect(toAwayMic(heard, 1, holding)?.id).toBe("pc");
    expect(toAwayMic([mic("pc", false), mic("camera-2", true)], 1, holding)?.id).toBe("camera-2");
  });

  it("ne rend rien quand le micro est celui de ce téléphone, que personne n'écoute (Muet), ou que ce téléphone n'a pas le plan", () => {
    expect(toAwayMic([mic("pc", false), mic("camera-1", true)], 1, holding)).toBeNull();
    expect(toAwayMic(mics, 1, holding)).toBeNull();
    expect(toAwayMic([mic("pc", true)], 1, IDLE_STANDING)).toBeNull();
    expect(toAwayMic([mic("pc", true)], null, holding)?.id).toBe("pc");
  });
});
