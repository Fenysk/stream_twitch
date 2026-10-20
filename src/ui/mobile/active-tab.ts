// Un seul onglet actif par téléphone : l'identifiant du téléphone est dans le stockage, que tous les onglets Safari du même téléphone
// partagent. Le dernier onglet ouvert ou ramené au premier plan prend la main, les autres la perdent (la page coupe alors caméra, flux et
// liaisons, et montre un écran calme). Trois mécanismes, du meilleur au pire : Web Locks (le verrou se vole, le détenteur le sait), sinon un
// BroadcastChannel (chaque prise de main est annoncée, la plus récente gagne), sinon rien (l'onglet reste actif). La logique n'utilise le
// navigateur que par ces ports : elle se teste avec des faux.

// Le verrou de Web Locks vu de l'onglet : `steal` le prend à son détenteur, qui voit sa promesse refusée (AbortError). `hold` tourne tant que
// l'onglet tient le verrou : le rendre, c'est régler la promesse qu'il rend. La promesse de `steal` se règle quand l'onglet le rend, et se
// refuse quand on le lui vole.
export type LocksPort = { steal(name: string, hold: () => Promise<void>): Promise<void> };

// Une prise de main annoncée aux autres onglets : l'instant et l'onglet qui la fait.
export type Claim = { at: number; id: string };

export type ChannelPort = {
  post(claim: Claim): void;
  subscribe(listener: (claim: Claim) => void): () => void;
  close(): void;
};

// L'onglet est-il au premier plan ? `subscribe` prévient chaque fois qu'il y revient.
export type VisibilityPort = {
  isVisible(): boolean;
  subscribe(onVisible: () => void): () => void;
};

export type ActiveTabDeps = {
  locks: LocksPort | null;
  channel: ChannelPort | null;
  visibility: VisibilityPort;
  clock: () => number;
  createId: () => string;
  // L'onglet devient actif ou cesse de l'être. Il est actif tant qu'on ne lui a rien dit.
  onChange(isActive: boolean): void;
  log(message: string): void;
};

export type ActiveTab = {
  // Cet onglet prend la main : les autres la perdent.
  take(): void;
  // Cet onglet quitte : il rend la main.
  close(): void;
};

export const LOCK_NAME = "stream-twitch:mobile:active-tab";

type ClaimerDeps = Pick<ActiveTabDeps, "log"> & { updateActive: (isActive: boolean) => void };

const isAbort = (error: unknown): boolean => error instanceof Error && error.name === "AbortError";

// Web Locks : prendre la main, c'est voler le verrou ; la perdre, c'est se le faire voler. Une erreur autre que le vol (le navigateur
// refuse les verrous) ne dit rien des autres onglets : l'onglet reste actif.
const createLocksClaimer = (locks: LocksPort, { updateActive, log }: ClaimerDeps): ActiveTab => {
  let attempt = 0;
  let release: (() => void) | null = null;

  const end = (): void => {
    const rendered = release;
    release = null;
    rendered?.();
  };

  return {
    take() {
      if (release) return;
      attempt += 1;
      const mine = attempt;
      locks
        .steal(
          LOCK_NAME,
          () =>
            new Promise<void>((resolve) => {
              release = resolve;
              updateActive(true);
            }),
        )
        .catch((error: unknown) => {
          if (mine !== attempt) return;
          end();
          if (isAbort(error)) {
            updateActive(false);
            return;
          }
          log(`Onglet : le navigateur refuse le verrou, cet onglet reste actif (${String(error)}).`);
          updateActive(true);
        });
    },
    close() {
      attempt += 1;
      end();
    },
  };
};

// La prise de main la plus récente gagne (à l'instant égal, l'identifiant le plus grand) : deux onglets ouverts ensemble ne cèdent pas tous
// les deux.
const isNewer = (claim: Claim, than: Claim): boolean =>
  claim.at > than.at || (claim.at === than.at && claim.id > than.id);

// BroadcastChannel : chaque prise de main est annoncée, et un onglet qui en reçoit une plus récente que la sienne cède.
const createChannelClaimer = (
  channel: ChannelPort,
  { clock, createId }: Pick<ActiveTabDeps, "clock" | "createId">,
  { updateActive }: ClaimerDeps,
): ActiveTab => {
  const id = createId();
  let own: Claim | null = null;
  const stop = channel.subscribe((claim) => {
    if (own && !isNewer(claim, own)) return;
    own = null;
    updateActive(false);
  });
  return {
    take() {
      own = { at: clock(), id };
      channel.post(own);
      updateActive(true);
    },
    close() {
      stop();
      channel.close();
    },
  };
};

// Ni verrou ni canal : rien ne dit qu'un autre onglet existe, l'onglet reste actif.
const createAloneClaimer = ({ updateActive }: ClaimerDeps): ActiveTab => ({
  take: () => updateActive(true),
  close: () => undefined,
});

const toClaimer = (deps: ActiveTabDeps, claimerDeps: ClaimerDeps): ActiveTab => {
  if (deps.locks) return createLocksClaimer(deps.locks, claimerDeps);
  if (deps.channel) return createChannelClaimer(deps.channel, deps, claimerDeps);
  return createAloneClaimer(claimerDeps);
};

export function createActiveTab(deps: ActiveTabDeps): ActiveTab {
  let isActive = true;
  const updateActive = (next: boolean): void => {
    if (next === isActive) return;
    isActive = next;
    deps.onChange(next);
  };
  const claimer = toClaimer(deps, { updateActive, log: deps.log });
  // Un onglet ouvert au premier plan prend la main ; ouvert en arrière-plan, il ne la prend pas et attend d'y venir.
  if (deps.visibility.isVisible()) claimer.take();
  else updateActive(false);
  const stopWatching = deps.visibility.subscribe(() => {
    if (!isActive) claimer.take();
  });
  return {
    take: claimer.take,
    close() {
      stopWatching();
      claimer.close();
    },
  };
}
