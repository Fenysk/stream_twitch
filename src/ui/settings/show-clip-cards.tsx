// Les cartes de l'onglet « Émission » qui parlent des clips : l'éditeur du clip ouvert (brut ou confirmé), et les deux listes. L'onglet
// garde l'état (le clip ouvert, la dernière action) et le serveur ; ces cartes ne font qu'afficher.

import type { ClipList } from "../../domain/clip.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import { ClipEditor } from "../clips/clip-editor";
import { ClipRows } from "../clips/clip-rows";
import { ConfirmedClipEditor } from "../clips/confirmed-clip-editor";
import { ConfirmedRows } from "../clips/confirmed-rows";
import { DESIGN_TEXTS } from "../design/design-texts";
import { SettingsCard } from "./settings-page";
import type { UseClips } from "./use-clips";

// Le clip ouvert dans l'éditeur : un clip brut, ou un clip de l'émission.
export type Selection = { kind: "raw" | "confirmed"; name: string };

type EditorCardProps = {
  // Les sounds de la soundboard (`null` tant qu'elle n'est pas lue), de quoi choisir les rires de la fin du clip.
  sounds: SoundSummary[] | null;
  selection: Selection | null;
  list: ClipList | null;
  clips: Pick<UseClips, "isWorking" | "confirm" | "discard" | "revise" | "withdraw">;
  onDone: (notice: string) => void;
};

// L'éditeur du clip ouvert : rien quand aucun n'est ouvert, ou que la liste l'a perdu depuis (le clip a été rangé).
export const EditorCard = ({ selection, list, sounds, clips, onDone }: EditorCardProps) => {
  const raw =
    selection?.kind === "raw" ? list?.clips.find((clip) => clip.name === selection.name) : undefined;
  const confirmed =
    selection?.kind === "confirmed"
      ? list?.confirmed.find((clip) => clip.name === selection.name)
      : undefined;
  if (raw) {
    return (
      <SettingsCard title="Lecteur">
        <ClipEditor
          key={raw.name}
          clip={raw}
          sounds={sounds}
          isWorking={clips.isWorking}
          onConfirm={clips.confirm}
          onDiscard={clips.discard}
          onDone={onDone}
        />
      </SettingsCard>
    );
  }
  if (!confirmed) return null;
  return (
    <SettingsCard title="Modifier un clip de l'émission">
      <ConfirmedClipEditor
        key={confirmed.name}
        clip={confirmed}
        sounds={sounds}
        isWorking={clips.isWorking}
        onRevise={clips.revise}
        onWithdraw={clips.withdraw}
        onDone={onDone}
      />
    </SettingsCard>
  );
};

type ListCardsProps = {
  list: ClipList | null;
  error: string | null;
  selection: Selection | null;
  isWorking: boolean;
  onSelect: (kind: Selection["kind"], name: string) => void;
};

// Les clips bruts du dossier d'OBS, puis les clips de l'émission.
export const ListCards = ({ list, error, selection, isWorking, onSelect }: ListCardsProps) => {
  const nameOf = (kind: Selection["kind"]) => (selection?.kind === kind ? selection.name : null);
  return (
    <>
      <SettingsCard title="Clips bruts">
        {list && list.clips.length === 0 && (
          <p className="lp-type-body lp-muted">Aucun clip brut dans le dossier d'OBS.</p>
        )}
        {list && list.clips.length > 0 && (
          <ClipRows
            clips={list.clips}
            selectedName={nameOf("raw")}
            isDisabled={isWorking}
            onSelect={(name) => onSelect("raw", name)}
          />
        )}
        {!list && !error && <p className="lp-type-body">{DESIGN_TEXTS.loading}</p>}
      </SettingsCard>
      <SettingsCard title="Clips de l'émission">
        {list && list.confirmed.length === 0 && (
          <p className="lp-type-body lp-muted">Aucun clip validé pour l'instant.</p>
        )}
        {list && list.confirmed.length > 0 && (
          <ConfirmedRows
            clips={list.confirmed}
            selectedName={nameOf("confirmed")}
            isDisabled={isWorking}
            onSelect={(name) => onSelect("confirmed", name)}
          />
        )}
      </SettingsCard>
    </>
  );
};
