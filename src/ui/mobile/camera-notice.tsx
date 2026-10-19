import type { CameraStatus } from "./use-camera-stream";

type Notice = { title: string; hint: string; action: string | null };

const NOTICES: Record<Exclude<CameraStatus, "live">, Notice> = {
  starting: {
    title: "Démarrage de la caméra…",
    hint: "Si Safari le demande, autorise la caméra et le micro.",
    action: null,
  },
  interrupted: {
    title: "La caméra s'est arrêtée",
    hint: "Safari coupe la caméra quand il passe en arrière-plan.",
    action: "Touche pour relancer",
  },
  denied: {
    title: "Caméra ou micro refusé",
    hint: "Autorise-les pour ce site dans les réglages de Safari.",
    action: "Touche pour réessayer",
  },
  unavailable: {
    title: "Caméra introuvable",
    hint: "Une autre application l'utilise peut-être.",
    action: "Touche pour réessayer",
  },
};

type CameraNoticeProps = { status: Exclude<CameraStatus, "live">; onRestart: () => void };

// L'écran qui couvre l'aperçu quand la caméra ne tourne pas. Quand un toucher peut y remédier, tout l'écran est ce toucher : Safari
// n'accorde la caméra qu'à un geste.
export const CameraNotice = ({ status, onRestart }: CameraNoticeProps) => {
  const { title, hint, action } = NOTICES[status];
  const text = (
    <>
      <span className="lp-type-heading">{title}</span>
      <span className="lp-type-body lp-muted">{hint}</span>
      {action && <span className="lp-type-title">{action}</span>}
    </>
  );
  return action ? (
    <button type="button" className="camera-notice" onClick={onRestart}>
      {text}
    </button>
  ) : (
    <div className="camera-notice" role="status">
      {text}
    </div>
  );
};
