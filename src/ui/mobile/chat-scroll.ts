// Le chat du téléphone reste collé en bas tant qu'on y est, et laisse tranquille quiconque est remonté lire l'historique. Ces règles
// ne connaissent pas le navigateur : elles lisent des mesures et rendent l'état suivant.

// Les mesures d'une zone qui défile (`scrollTop`, `clientHeight` et `scrollHeight` d'un élément).
export type ScrollMetrics = { scrollTop: number; clientHeight: number; scrollHeight: number };

// Ce qui reste de la zone sous la vue, en px, et qui compte encore comme « en bas » : les sous-pixels des écrans à fort ratio, le rebond d'iOS, la
// marge qu'un message ou une emote qui se charge ajoute avant qu'on recolle.
export const BOTTOM_TOLERANCE_PX = 24;

export const isAtBottom = ({ scrollTop, clientHeight, scrollHeight }: ScrollMetrics): boolean =>
  scrollHeight - (scrollTop + clientHeight) <= BOTTOM_TOLERANCE_PX;

// `isPinned` : la vue suit le bas, chaque nouveau message la garde en bas. `hasNews` : des messages sont arrivés pendant qu'on lisait plus
// haut, la pastille « Nouveaux messages » le dit.
export type StickState = { isPinned: boolean; hasNews: boolean };

// À l'ouverture, on est en bas.
export const INITIAL_STICK: StickState = { isPinned: true, hasNews: false };

// L'utilisateur a fait défiler la zone : en bas, la vue suit à nouveau et la pastille n'a plus lieu d'être ; ailleurs, elle ne suit plus.
export const toStickAfterScroll = (state: StickState, metrics: ScrollMetrics): StickState =>
  isAtBottom(metrics) ? INITIAL_STICK : { isPinned: false, hasNews: state.hasNews };

// `count` messages sont arrivés. Collée en bas, la vue doit y rester, même quand les messages arrivent en rafale ; sinon rien ne bouge
// et la pastille s'allume.
export const toStickAfterMessages = (
  state: StickState,
  count: number,
): { state: StickState; shouldScroll: boolean } => {
  if (count <= 0) return { state, shouldScroll: false };
  if (state.isPinned) return { state, shouldScroll: true };
  return { state: { isPinned: false, hasNews: true }, shouldScroll: false };
};

// Un toucher sur la pastille : on revient en bas, collé.
export const toStickAfterJump = (): StickState => INITIAL_STICK;

// La zone a changé de taille (le champ « Écrire » s'ouvre avec le clavier, une emote se charge) sans qu'un message arrive : collée en bas,
// elle y reste ; sinon rien ne bouge.
export const shouldFollowResize = ({ isPinned }: StickState): boolean => isPinned;
