// Le vumètre du micro : le level en dB en direct, avec les repères du seuil, du niveau doux et du niveau fort. Sans lui,
// régler le seuil se ferait à l'aveugle. Les repères suivent les réglages : on les déplace, on voit où ils tombent.

import { classNames } from "../design/class-names";
import { toMeterMarks, toMeterPosition, toMeterTone } from "./meter-marks";

type MicMeterProps = {
  level: number;
  isLinked: boolean;
  threshold: number;
  quietLevel?: number | undefined;
  loudLevel?: number | undefined;
};

export const MicMeter = ({ level, isLinked, threshold, quietLevel, loudLevel }: MicMeterProps) => {
  const levels = { threshold, quietLevel, loudLevel };
  const marks = toMeterMarks(levels);
  const tone = toMeterTone(level, levels);
  const reading = isLinked ? `${level.toFixed(1)} dB` : "OBS non joint";
  return (
    <div className="lp-meter">
      <div className="lp-meter-head lp-type-body">
        <span>Niveau du micro</span>
        <span className="lp-type-numeric">{reading}</span>
      </div>
      <div className="lp-meter-scale">
        {/* Le vrai <meter> est pour les lecteurs d'écran ; la piste dessinée n'est qu'une image. */}
        <meter
          className="lp-visually-hidden"
          min={-60}
          max={0}
          value={Math.max(-60, level)}
          aria-label="Niveau du micro"
        >
          {reading}
        </meter>
        <div className="lp-meter-track" aria-hidden="true">
          <div
            className={classNames("lp-meter-fill", `lp-meter-fill--${tone}`)}
            style={{ transform: `scaleX(${toMeterPosition(level)})` }}
          />
          {marks.map(({ id, position }) => (
            <span key={id} className="lp-meter-mark" style={{ left: `${position * 100}%` }} />
          ))}
        </div>
        <div className="lp-meter-labels lp-type-caption lp-muted" aria-hidden="true">
          {marks.map(({ id, label, level: markLevel, position }) => (
            <span key={id} className="lp-meter-label" style={{ left: `${position * 100}%` }}>
              {label}
              <span className="lp-type-numeric">{markLevel} dB</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
