// La page `/countdown` : une pill qui dit dans combien de temps Fenysk revient, source OBS à part, transparente hors émission. Elle ne
// compte rien : le serveur estime l'instant (`returnAt`), elle le lit dans le flux de l'émission (une seule connexion, jamais comme
// page `/show`).

import { toCountdownText } from "../../domain/show.rules";
import { classNames } from "../design/class-names";
import { useShownWhileClosing } from "../design/window";
import { useNow } from "../settings/use-now";
import { useShowState } from "../settings/use-show-state";

export const ShowCountdown = () => {
  const { status, returnAt } = useShowState();
  const now = useNow(1000);
  const isVisible = status === "running" && returnAt > 0;
  // Le texte reste écrit pendant le fondu de sortie.
  const text = useShownWhileClosing(isVisible ? toCountdownText(returnAt - now) : null);
  return (
    <main className="show-countdown" data-appearance="dark">
      <div className={classNames("show-countdown-fade", isVisible && "is-visible")} aria-hidden={!isVisible}>
        <div className="lp-pill show-countdown-pill">
          <p className="show-countdown-text">{text}</p>
        </div>
      </div>
    </main>
  );
};
