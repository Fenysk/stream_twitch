// Un flux SSE peut mourir sans erreur (Tailscale bloqué, un réseau qui avale les paquets) : le téléphone doit donc le tenir pour périmé
// quand le serveur ne dit plus rien. Ce suivi compte `staleMs` de silence ; tout signe de vie le recompte.
export type Freshness = {
  // Une connexion vient de s'ouvrir : le compte repart, sans rien dire de l'état (il redevient vivant au premier signe de vie).
  watch: () => void;
  // Un message ou un battement est arrivé : le flux est vivant, le compte repart.
  hear: () => void;
  // Une erreur : le flux est périmé tout de suite. Le compte s'arrête jusqu'à la réouverture (`watch`).
  lose: () => void;
  close: () => void;
};

type FreshnessInput = {
  staleMs: number;
  // Le flux devient périmé (`true`) ou redevient vivant (`false`) : jamais deux fois la même valeur de suite.
  onChange: (isStale: boolean) => void;
  // Le silence a duré `staleMs` : la connexion est peut-être morte sans erreur, il faut la rouvrir.
  onSilence: () => void;
};

export const createFreshness = ({ staleMs, onChange, onSilence }: FreshnessInput): Freshness => {
  let isStale = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const update = (next: boolean): void => {
    if (next === isStale) return;
    isStale = next;
    onChange(next);
  };
  const count = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      update(true);
      onSilence();
    }, staleMs);
  };

  return {
    watch: count,
    hear: () => {
      count();
      update(false);
    },
    lose: () => {
      clearTimeout(timer);
      update(true);
    },
    close: () => clearTimeout(timer),
  };
};
