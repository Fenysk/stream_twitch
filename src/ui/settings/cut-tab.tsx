// L'onglet « Découpe » : importer une image (bouton, glisser-déposer ou coller), régler la coupe sur le plateau, voir
// le résultat en aperçu, puis l'enregistrer comme expression. Une expression enregistrée se rouvre pour la retoucher.

import { Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toExpressionGeometry } from "../../domain/cut.rules";
import { toHead } from "../../domain/head.schema";
import { CutBoard, type HingeSide } from "../cut/cut-board";
import { CutPreview } from "../cut/cut-preview";
import { CutSave } from "../cut/cut-save";
import { CutSide } from "../cut/cut-side";
import { useCutEditor } from "../cut/use-cut-editor";
import { usePartPreviews } from "../cut/use-part-previews";
import { useWindowImport } from "../cut/use-window-import";
import { Button } from "../design/button";
import { ExpressionThumbs } from "./expression-thumbs";
import { useExpressions } from "./use-expressions";

export const CutTab = () => {
  const { expressions, refresh } = useExpressions();
  const editor = useCutEditor(refresh);
  const { draft, image, refusal, notice, isBusy, openFile } = editor;
  const [selected, setSelected] = useState<HingeSide>("left");
  const fileInput = useRef<HTMLInputElement>(null);
  const previews = usePartPreviews(image, draft?.size, draft?.cut, draft?.lips);
  useWindowImport(openFile);

  const head = useMemo(
    () => (draft ? toHead(toExpressionGeometry(draft), { id: "preview", version: "1" }) : null),
    [draft],
  );
  const saved = (expressions ?? []).filter(({ isBuiltIn }) => !isBuiltIn);

  return (
    <div className="cut-tab">
      <div className="cut-import">
        <Button
          label="Importer une image"
          icon={Upload}
          variant="primary"
          isDisabled={isBusy}
          onPress={() => fileInput.current?.click()}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void openFile(file);
          }}
        />
        <p className="lp-type-caption lp-muted">Glisse ou colle une image.</p>
      </div>
      {refusal && (
        <p role="alert" className="lp-type-body lp-danger">
          {refusal}
        </p>
      )}
      {notice && !draft && (
        <p role="status" className="lp-type-body">
          {notice}
        </p>
      )}
      {saved.length > 0 && (
        <ExpressionThumbs
          label="Expressions enregistrées"
          expressions={saved}
          currentId={draft?.expressionId ?? null}
          onPick={(id) => void editor.reopen(id)}
        />
      )}
      {draft && head && (
        <>
          <div className="cut-work">
            <div className="cut-board-column">
              <CutBoard
                sourceUrl={draft.sourceUrl}
                size={draft.size}
                cut={draft.cut}
                selected={selected}
                onSelect={setSelected}
                onCutChange={(cut) => editor.adjust({ cut })}
              />
              {draft.expressionId === null && (
                <p className="lp-type-caption lp-muted">
                  {draft.isGapFound ? "Coupe trouvée dans l'image." : "Coupe devinée : ajuste-la."}
                </p>
              )}
            </div>
            <CutSide
              sourceUrl={draft.sourceUrl}
              size={draft.size}
              cut={draft.cut}
              selected={selected}
              lips={draft.lips}
              closing={draft.closing}
              onLipsChange={(lips) => editor.adjust({ lips })}
              onClosingChange={(closing) => editor.adjust({ closing })}
            />
          </div>
          {previews && <CutPreview head={head} images={previews} />}
          <CutSave
            name={draft.name}
            isRetouch={draft.expressionId !== null}
            isBusy={isBusy}
            isReady={image !== null && draft.name.trim().length > 0}
            notice={notice}
            onNameChange={(name) => editor.adjust({ name })}
            onSubmit={() => void editor.submit()}
            onDelete={() => void editor.deleteCurrent()}
            onClose={editor.startOver}
          />
        </>
      )}
    </div>
  );
};
