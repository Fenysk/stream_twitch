import { classNames } from "../design/class-names";
import { ToastAnnouncement, ToastAnnouncementContext, type ToastMessage } from "../design/toast-announcement";

// Le toast de la régie : une pill en haut de la page, et, pour un lecteur d'écran, les deux régions du design system (une erreur
// s'annonce tout de suite). La pill n'est pas lue : les régions la disent déjà.
export const ControlToast = ({ message }: { message: ToastMessage | null }) => (
  <ToastAnnouncementContext.Provider value={message}>
    <ToastAnnouncement />
    {message && (
      <div className="lp-pill control-toast" aria-hidden="true">
        <div className="lp-pill-content">
          <span className={classNames("lp-type-body", message.tone === "error" && "lp-warning")}>
            {message.text}
          </span>
        </div>
      </div>
    )}
  </ToastAnnouncementContext.Provider>
);
