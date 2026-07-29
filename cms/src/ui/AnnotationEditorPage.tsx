import { useMemo, useState, type ReactNode } from "react";
import { maxAnnotationTextCharacters, maxAnnotationTitleCharacters } from "../shared/annotationLimits.ts";
import type { AnnotationListItem, PlaceId } from "../shared/api.ts";
import { nullIfEmpty } from "../shared/JavascriptExtensions.ts";
import { deleteAnnotation, errorMessagesOf, fetchPlaces, saveAnnotation } from "./api.ts";
import { ErrorMessages } from "./ErrorMessages.tsx";
import { PlacePicker } from "./PlacePicker.tsx";
import { placeLabel } from "./placeLabel.ts";
import { useLoadable } from "./ReactExtensions.ts";

type ChosenPlace = { id: PlaceId; label: string };

type AnnotationEditorPageProps = {
  annotation: AnnotationListItem | null;
  onClose: () => void;
};

export function AnnotationEditorPage({ annotation, onClose }: AnnotationEditorPageProps) {
  // The values live here rather than in the form, so that choosing another place does not discard them.
  const [chosenPlace, setChosenPlace] = useState<ChosenPlace | null>(
    annotation === null
      ? null
      : { id: annotation.placeId, label: placeLabel({ name: annotation.placeName, subtype: annotation.placeSubtype }) },
  );
  const [isChangingPlace, setIsChangingPlace] = useState(false);
  const [title, setTitle] = useState(annotation?.title ?? "");
  const [text, setText] = useState(annotation?.text ?? "");
  const [validFrom, setValidFrom] = useState(annotation?.validFrom ?? "");
  const [validTo, setValidTo] = useState(annotation?.validTo ?? "");
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  if (chosenPlace === null || isChangingPlace) {
    return (
      <PlaceStep
        selectedPlaceId={chosenPlace?.id ?? null}
        onChoose={(place) => {
          setChosenPlace(place);
          setIsChangingPlace(false);
        }}
        onCancel={chosenPlace === null ? onClose : () => setIsChangingPlace(false)}
      />
    );
  }

  async function closeAfter(action: () => Promise<void>) {
    setIsBusy(true);
    setErrorMessages([]);
    try {
      await action();
      onClose();
    } catch (error) {
      setErrorMessages(errorMessagesOf(error));
      setIsBusy(false);
    }
  }

  const save = () =>
    closeAfter(async () => {
      const input = {
        placeId: chosenPlace.id,
        title,
        text,
        validFrom: nullIfEmpty(validFrom),
        validTo: nullIfEmpty(validTo),
      };
      await saveAnnotation(input, annotation?.id ?? null);
    });

  const confirmAndDelete = (id: string) => {
    if (window.confirm("Hinweis wirklich löschen?")) closeAfter(() => deleteAnnotation(id));
  };

  return (
    <form
      className="annotation-form"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h2>{annotation === null ? "Neuer Hinweis" : "Hinweis bearbeiten"}</h2>
      <div className="field">
        <span className="field-label">Ort</span>
        <span>
          {chosenPlace.label}{" "}
          <button type="button" className="link" onClick={() => setIsChangingPlace(true)}>
            Ort ändern
          </button>
        </span>
      </div>
      <Field label="Titel">
        <input
          value={title}
          maxLength={maxAnnotationTitleCharacters}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label="Text">
        <textarea
          rows={4}
          value={text}
          maxLength={maxAnnotationTextCharacters}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <Field label="Gültig von">
        <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
      </Field>
      <Field label="Gültig bis" hint="leer = unbegrenzt">
        <input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
      </Field>
      {errorMessages.length > 0 && <ErrorMessages messages={errorMessages} />}
      <div className="actions">
        <button type="submit" className="primary" disabled={isBusy}>
          Speichern
        </button>
        <button type="button" onClick={onClose}>
          Abbrechen
        </button>
        {annotation !== null && (
          <button type="button" className="danger" disabled={isBusy} onClick={() => confirmAndDelete(annotation.id)}>
            Löschen
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>
        <span className="field-label">{label}</span>
        {children}
      </label>
      {hint !== undefined && <small>{hint}</small>}
    </div>
  );
}

type PlaceStepProps = {
  selectedPlaceId: PlaceId | null;
  onChoose: (place: ChosenPlace) => void;
  onCancel: () => void;
};

function PlaceStep({ selectedPlaceId, onChoose, onCancel }: PlaceStepProps) {
  const { loadable } = useLoadable(fetchPlaces);
  // A place that left OSM keeps its annotations but is no sensible target for new ones.
  const pickablePlaces = useMemo(
    () => (loadable.status === "loaded" ? loadable.value.filter((place) => !place.gone) : []),
    [loadable],
  );

  const choose = (placeId: PlaceId) => {
    const place = pickablePlaces.find(({ id }) => id === placeId);
    if (place !== undefined) onChoose({ id: place.id, label: placeLabel(place) });
  };

  return (
    <section>
      {loadable.status === "loading" && <p>Lädt…</p>}
      {loadable.status === "failed" && <ErrorMessages messages={errorMessagesOf(loadable.error)} />}
      {loadable.status === "loaded" && (
        <PlacePicker places={pickablePlaces} selectedPlaceId={selectedPlaceId} onSelect={choose} />
      )}
      <div className="actions">
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </section>
  );
}
