import { Button } from "../design/button";

// L'écran calme d'un onglet qui n'a plus la main : ce téléphone est utilisé dans un autre onglet (la caméra, le flux et les liaisons de
// celui-ci sont coupés). « Reprendre ici » reprend la main à l'autre.
export const OtherTab = ({ onTake }: { onTake: () => void }) => (
  <main className="other-tab" aria-live="polite">
    <h1 className="lp-type-heading">Ouvert dans un autre onglet</h1>
    <p className="lp-type-body lp-muted">
      Ce téléphone ne filme et ne se connecte qu'à partir d'un onglet à la fois.
    </p>
    <Button label="Reprendre ici" variant="primary" onPress={onTake} />
  </main>
);
