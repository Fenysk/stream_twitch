type BlackScreenProps = { isOnAir: boolean; onWake: () => void };

// L'écran noir : du noir pur sur tout l'écran (l'OLED de l'iPhone s'éteint), un toucher n'importe où le rallume. La caméra et le son
// continuent d'être envoyés. Seul un petit point rouge, si la caméra est à l'antenne, et « Touche pour rallumer », très sombre et qui
// s'efface au bout de 3 s (animation CSS : elle repart à chaque écran noir).
export const BlackScreen = ({ isOnAir, onWake }: BlackScreenProps) => (
  <button
    type="button"
    className="black-screen"
    aria-label={isOnAir ? "Rallumer l'écran, la caméra est à l'antenne" : "Rallumer l'écran"}
    onClick={onWake}
  >
    {isOnAir && <span className="black-screen-air" aria-hidden="true" />}
    <span className="black-screen-hint lp-type-body" aria-hidden="true">
      Touche pour rallumer
    </span>
  </button>
);
