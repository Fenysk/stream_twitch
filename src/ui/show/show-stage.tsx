// La page `/show` : transparente tant que l'émission n'a pas commencé. Pendant elle, un fond sobre du design system où passent, en fondu,
// l'ouverture et la clôture (un bandeau aux couleurs du design system qui glisse depuis la gauche, Jean-Renard grand à droite), le
// carton de chaque clip (même bandeau avec le jour et le titre du clip, sur le début du clip flou et assombri), puis le clip en plein
// écran avec son titre dans un coin, le tchat d'origine du clip en bas à gauche et Jean-Renard petit dans l'autre coin. Deux <video>
// superposés (celui qui joue, celui qui charge le suivant). Un seul Jean-Renard : sa voix et sa bouche sont ceux de cette page. Pendant
// toute l'émission, une pill en haut à droite dit dans combien de temps Fenysk revient.

import type { Ref } from "react";
import { toCountdownText } from "../../domain/show.rules";
import { ChatColumn } from "../chat/chat-column";
import { useChatView } from "../chat/use-chat-view";
import { classNames } from "../design/class-names";
import { useShownWhileClosing } from "../design/window";
import { Fox } from "../Fox";
import { useNow } from "../settings/use-now";
import { useFox } from "../use-fox";
import { type Banner, type ShowView, type Slot, toBanner, toFoxSpot, toShownSlot } from "./show-view";
import { useShow } from "./use-show";

type ShowVideoProps = { videoRef: Ref<HTMLVideoElement>; slot: Slot; view: ShowView };

// Le début du clip qui arrive sert de fond au carton, flou et assombri ; le flou se lève quand le clip joue.
const ShowVideo = ({ videoRef, slot, view }: ShowVideoProps) => (
  <video
    ref={videoRef}
    className={classNames(
      "show-video",
      toShownSlot(view) === slot && "is-visible",
      view.kind === "card" && view.slot === slot && "is-blurred",
    )}
    playsInline
    preload="auto"
  >
    {/* Un clip d'OBS n'a pas de sous-titres. */}
    <track kind="captions" />
  </video>
);

type ShowBannerProps = { banner: Banner | null; isVisible: boolean };

// Le bandeau glisse depuis la gauche quand il paraît ; son texte, remonté à chaque nouveau titre, reste écrit pendant qu'il sort.
const ShowBanner = ({ banner, isVisible }: ShowBannerProps) => (
  <section className={classNames("show-banner", isVisible && "is-visible")} aria-hidden={!isVisible}>
    <div className="show-banner-body" key={`${banner?.kicker}|${banner?.title}`}>
      <p className="show-banner-kicker">{banner?.kicker}</p>
      <h1 className="show-banner-title">{banner?.title}</h1>
    </div>
  </section>
);

type ShowCountdownProps = { returnAt: number | null };

// Dans combien de temps Fenysk revient, en haut à droite. Le seul à se redessiner chaque seconde ; son texte reste écrit pendant qu'il
// s'efface.
const ShowCountdown = ({ returnAt }: ShowCountdownProps) => {
  const now = useNow(1000);
  const text = useShownWhileClosing(returnAt === null ? null : toCountdownText(returnAt - now));
  const isVisible = returnAt !== null;
  return (
    <div className={classNames("show-countdown", isVisible && "is-visible")} aria-hidden={!isVisible}>
      <div className="lp-pill show-countdown-pill">
        <p className="show-countdown-text">{text}</p>
      </div>
    </div>
  );
};

export const ShowStage = () => {
  const fox = useFox("show");
  const { videos, view, chat, returnAt } = useShow(fox.updateMode);
  const { look } = useChatView();
  const banner = toBanner(view, Date.now());
  // Le titre du coin reste écrit pendant qu'il s'efface.
  const cornerTitle = useShownWhileClosing(view.kind === "clip" ? view.title : null);
  const shownBanner = useShownWhileClosing(banner);
  return (
    <main className="show-stage" data-appearance="dark" data-view={view.kind}>
      <div className="show-backdrop" />
      <ShowVideo videoRef={videos[0]} slot={0} view={view} />
      <ShowVideo videoRef={videos[1]} slot={1} view={view} />
      <ShowBanner banner={shownBanner} isVisible={banner !== null} />
      <div
        className={classNames("show-title", view.kind === "clip" && "is-visible")}
        aria-hidden={view.kind !== "clip"}
      >
        <div className="lp-pill show-title-pill">
          <p className="show-title-text">{cornerTitle}</p>
        </div>
      </div>
      <ShowCountdown returnAt={view.kind === "none" ? null : returnAt} />
      {look && (
        <div
          className={classNames("show-chat", view.kind === "clip" && "is-visible")}
          aria-hidden={view.kind !== "clip"}
        >
          <ChatColumn messages={chat} look={look} layout="box" />
        </div>
      )}
      <div className={classNames("show-fox", `is-${toFoxSpot(view)}`)}>
        {fox.image && <Fox image={fox.image} bodyRef={fox.bodyRef} layout="box" />}
      </div>
    </main>
  );
};
