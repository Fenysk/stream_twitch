import { describe, expect, it } from "vitest";
import {
  type ActiveTab,
  type ChannelPort,
  type Claim,
  createActiveTab,
  LOCK_NAME,
  type LocksPort,
} from "./active-tab";

// Un faux Web Locks, partagé par les onglets d'un test : comme le vrai, un verrou volé refuse (AbortError) la promesse de son ancien
// détenteur, puis le nouveau le tient jusqu'à ce qu'il le rende.
const createFakeLocks = () => {
  let rejectHolder: ((error: unknown) => void) | null = null;
  const names: string[] = [];
  const port: LocksPort = {
    steal(name, hold) {
      names.push(name);
      rejectHolder?.(new DOMException("verrou volé", "AbortError"));
      return new Promise<void>((resolve, reject) => {
        rejectHolder = reject;
        void hold().then(resolve);
      });
    },
  };
  return { port, names };
};

// Un faux BroadcastChannel : chaque onglet reçoit les prises de main des autres, pas les siennes.
const createFakeBus = () => {
  const listeners = new Set<(claim: Claim) => void>();
  const claims: Claim[] = [];
  const open = (): { port: ChannelPort; isClosed: () => boolean } => {
    let own: ((claim: Claim) => void) | null = null;
    let isClosed = false;
    return {
      port: {
        post(claim) {
          claims.push(claim);
          for (const listener of listeners) if (listener !== own) listener(claim);
        },
        subscribe(listener) {
          own = listener;
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        close() {
          isClosed = true;
        },
      },
      isClosed: () => isClosed,
    };
  };
  return { open, claims };
};

// La visibilité d'un onglet que le test commande.
const createFakeVisibility = (isVisibleAtStart = true) => {
  let isVisible = isVisibleAtStart;
  const listeners = new Set<() => void>();
  return {
    port: {
      isVisible: () => isVisible,
      subscribe(onVisible: () => void) {
        listeners.add(onVisible);
        return () => listeners.delete(onVisible);
      },
    },
    show() {
      isVisible = true;
      for (const listener of listeners) listener();
    },
    hide() {
      isVisible = false;
    },
    listenerCount: () => listeners.size,
  };
};

type TabSetup = {
  locks?: LocksPort | null;
  channel?: ChannelPort | null;
  isVisible?: boolean;
  clock?: () => number;
  id?: string;
};

// Un onglet : ce qu'il a appris de son activité, dans l'ordre, et de quoi le commander.
const openTab = ({
  locks = null,
  channel = null,
  isVisible = true,
  clock = () => 1000,
  id = "tab",
}: TabSetup) => {
  const changes: string[] = [];
  const logs: string[] = [];
  const visibility = createFakeVisibility(isVisible);
  const tab: ActiveTab = createActiveTab({
    locks,
    channel,
    visibility: visibility.port,
    clock,
    createId: () => id,
    onChange: (isActive) => changes.push(isActive ? "actif" : "inactif"),
    log: (line) => logs.push(line),
  });
  return { tab, changes, logs, visibility };
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("Web Locks", () => {
  it("Quand le premier onglet s'ouvre, le système doit lui donner la main sans rien lui dire : il l'a déjà", async () => {
    const locks = createFakeLocks();
    const first = openTab({ locks: locks.port });
    await settle();
    expect(locks.names).toEqual([LOCK_NAME]);
    expect(first.changes).toEqual([]);
  });

  it("Quand un deuxième onglet s'ouvre, le système doit lui donner la main et la retirer au premier", async () => {
    const locks = createFakeLocks();
    const first = openTab({ locks: locks.port });
    const second = openTab({ locks: locks.port });
    await settle();
    expect(first.changes).toEqual(["inactif"]);
    expect(second.changes).toEqual([]);
  });

  it("Quand l'onglet qui a perdu la main la reprend (« Reprendre ici »), le système doit la retirer à l'autre", async () => {
    const locks = createFakeLocks();
    const first = openTab({ locks: locks.port });
    const second = openTab({ locks: locks.port });
    await settle();
    first.tab.take();
    await settle();
    expect(first.changes).toEqual(["inactif", "actif"]);
    expect(second.changes).toEqual(["inactif"]);
  });

  it("ne vole rien à celui qui tient déjà le verrou quand il le redemande", async () => {
    const locks = createFakeLocks();
    const first = openTab({ locks: locks.port });
    await settle();
    first.tab.take();
    first.tab.take();
    await settle();
    expect(locks.names).toEqual([LOCK_NAME]);
    expect(first.changes).toEqual([]);
  });

  it("Quand un onglet est ramené au premier plan après avoir perdu la main, le système doit la lui rendre", async () => {
    const locks = createFakeLocks();
    const first = openTab({ locks: locks.port });
    const second = openTab({ locks: locks.port });
    await settle();
    first.visibility.show();
    await settle();
    expect(first.changes).toEqual(["inactif", "actif"]);
    expect(second.changes).toEqual(["inactif"]);
  });

  it("ne vole rien quand un onglet déjà actif revient au premier plan", async () => {
    const locks = createFakeLocks();
    const first = openTab({ locks: locks.port });
    await settle();
    first.visibility.show();
    await settle();
    expect(locks.names).toEqual([LOCK_NAME]);
    expect(first.changes).toEqual([]);
  });

  it("Quand un onglet s'ouvre en arrière-plan, le système ne doit pas lui donner la main avant qu'il vienne au premier plan", async () => {
    const locks = createFakeLocks();
    const first = openTab({ locks: locks.port });
    const background = openTab({ locks: locks.port, isVisible: false });
    await settle();
    expect(locks.names).toEqual([LOCK_NAME]);
    expect(first.changes).toEqual([]);
    expect(background.changes).toEqual(["inactif"]);
    background.visibility.show();
    await settle();
    expect(background.changes).toEqual(["inactif", "actif"]);
    expect(first.changes).toEqual(["inactif"]);
  });

  it("rend le verrou quand l'onglet quitte : celui qui prend la main ensuite ne fait perdre la main à personne", async () => {
    const locks = createFakeLocks();
    const first = openTab({ locks: locks.port });
    await settle();
    first.tab.close();
    const second = openTab({ locks: locks.port });
    await settle();
    expect(first.changes).toEqual([]);
    expect(second.changes).toEqual([]);
  });

  it("n'écoute plus le premier plan une fois quitté", async () => {
    const locks = createFakeLocks();
    const first = openTab({ locks: locks.port });
    await settle();
    first.tab.close();
    expect(first.visibility.listenerCount()).toBe(0);
  });

  it("Si le navigateur refuse le verrou pour une autre raison qu'un vol, alors l'onglet doit rester actif et le dire dans le journal", async () => {
    const refusing: LocksPort = { steal: () => Promise.reject(new Error("SecurityError")) };
    const tab = openTab({ locks: refusing });
    await settle();
    expect(tab.changes).toEqual([]);
    expect(tab.logs).toEqual([
      "Onglet : le navigateur refuse le verrou, cet onglet reste actif (Error: SecurityError).",
    ]);
  });
});

describe("BroadcastChannel, quand Web Locks manque", () => {
  it("Quand un deuxième onglet s'ouvre, le système doit lui donner la main et la retirer au premier", () => {
    const bus = createFakeBus();
    const first = openTab({ channel: bus.open().port, clock: () => 100, id: "a" });
    const second = openTab({ channel: bus.open().port, clock: () => 200, id: "b" });
    expect(first.changes).toEqual(["inactif"]);
    expect(second.changes).toEqual([]);
    expect(bus.claims).toEqual([
      { at: 100, id: "a" },
      { at: 200, id: "b" },
    ]);
  });

  it("Quand l'onglet qui a perdu la main la reprend, le système doit la retirer à l'autre", () => {
    const bus = createFakeBus();
    let now = 100;
    const first = openTab({ channel: bus.open().port, clock: () => now, id: "a" });
    now = 200;
    const second = openTab({ channel: bus.open().port, clock: () => now, id: "b" });
    now = 300;
    first.tab.take();
    expect(first.changes).toEqual(["inactif", "actif"]);
    expect(second.changes).toEqual(["inactif"]);
  });

  it("Quand deux onglets s'ouvrent au même instant, un seul doit céder : celui dont l'identifiant est le plus petit", () => {
    const bus = createFakeBus();
    const first = openTab({ channel: bus.open().port, clock: () => 500, id: "a" });
    const second = openTab({ channel: bus.open().port, clock: () => 500, id: "b" });
    expect(first.changes).toEqual(["inactif"]);
    expect(second.changes).toEqual([]);
  });

  it("ignore l'annonce d'une prise de main plus ancienne que la sienne", () => {
    const bus = createFakeBus();
    const channels = [bus.open(), bus.open()];
    const [mine, other] = channels;
    if (!mine || !other) throw new Error("deux canaux attendus");
    const tab = openTab({ channel: mine.port, clock: () => 900, id: "b" });
    other.port.subscribe(() => undefined);
    other.port.post({ at: 100, id: "a" });
    expect(tab.changes).toEqual([]);
  });

  it("Quand un onglet est ramené au premier plan après avoir perdu la main, le système doit la lui rendre", () => {
    const bus = createFakeBus();
    let now = 100;
    const first = openTab({ channel: bus.open().port, clock: () => now, id: "a" });
    now = 200;
    const second = openTab({ channel: bus.open().port, clock: () => now, id: "b" });
    now = 300;
    first.visibility.show();
    expect(first.changes).toEqual(["inactif", "actif"]);
    expect(second.changes).toEqual(["inactif"]);
  });

  it("ne prend pas la main d'un onglet ouvert en arrière-plan, et ferme le canal quand l'onglet quitte", () => {
    const bus = createFakeBus();
    const channel = bus.open();
    const background = openTab({ channel: channel.port, isVisible: false, id: "a" });
    expect(bus.claims).toEqual([]);
    expect(background.changes).toEqual(["inactif"]);
    background.tab.close();
    expect(channel.isClosed()).toBe(true);
  });
});

describe("sans Web Locks ni BroadcastChannel", () => {
  it("laisse l'onglet actif, sans rien dire, et ne fait rien d'un appel à take", () => {
    const tab = openTab({});
    tab.tab.take();
    expect(tab.changes).toEqual([]);
  });

  it("n'active un onglet ouvert en arrière-plan qu'une fois au premier plan", () => {
    const tab = openTab({ isVisible: false });
    expect(tab.changes).toEqual(["inactif"]);
    tab.visibility.show();
    expect(tab.changes).toEqual(["inactif", "actif"]);
  });
});

describe("le choix du mécanisme", () => {
  it("préfère Web Locks au canal quand le navigateur offre les deux", async () => {
    const locks = createFakeLocks();
    const bus = createFakeBus();
    openTab({ locks: locks.port, channel: bus.open().port });
    await settle();
    expect(locks.names).toEqual([LOCK_NAME]);
    expect(bus.claims).toEqual([]);
  });
});
