import { useState } from "react";
import type { AnnotationListItem, ImportResult, IsoDate } from "../shared/api.ts";
import { annotationStateOn, type AnnotationState } from "../shared/annotationState.ts";
import { errorMessagesOf, fetchAnnotations, importPlaces } from "./api.ts";
import { ErrorMessages } from "./ErrorMessages.tsx";
import { formatDateRange } from "./formatDateRange.ts";
import { placeLabel } from "./placeLabel.ts";
import { useLoadable } from "./ReactExtensions.ts";

const tabs: { state: AnnotationState; label: string }[] = [
  { state: "active", label: "Aktiv" },
  { state: "scheduled", label: "Geplant" },
  { state: "expired", label: "Abgelaufen" },
];

type ImportOutcome =
  { kind: "running" } | { kind: "succeeded"; message: string } | { kind: "failed"; messages: string[] };

function describeImport({ importedPlaceCount, goneMarkingSkipped }: ImportResult): string {
  const message = `${importedPlaceCount} Orte aktualisiert`;
  return goneMarkingSkipped ? `${message} – OSM-Antwort unvollständig, keine Orte als entfernt markiert` : message;
}

type AnnotationListPageProps = {
  today: IsoDate;
  onNewAnnotation: () => void;
  onEditAnnotation: (annotation: AnnotationListItem) => void;
};

export function AnnotationListPage({ today, onNewAnnotation, onEditAnnotation }: AnnotationListPageProps) {
  const { loadable, reload } = useLoadable(fetchAnnotations);
  const [selectedState, setSelectedState] = useState<AnnotationState>("active");
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null);
  const isImporting = importOutcome?.kind === "running";

  async function importPlacesAndReload() {
    // Overpass can take over a minute, during which the outcome of the previous import would be misleading.
    setImportOutcome({ kind: "running" });
    try {
      setImportOutcome({ kind: "succeeded", message: describeImport(await importPlaces()) });
      // An import can mark places as gone, which the list badges.
      reload();
    } catch (error) {
      setImportOutcome({ kind: "failed", messages: errorMessagesOf(error) });
    }
  }

  const annotationsIn = (state: AnnotationState, annotations: AnnotationListItem[]) =>
    annotations.filter((annotation) => annotationStateOn(annotation, today) === state);

  return (
    <section>
      <div className="toolbar">
        <div role="tablist" className="tabs">
          {loadable.status === "loaded" &&
            tabs.map(({ state, label }) => (
              <button
                key={state}
                type="button"
                role="tab"
                aria-selected={state === selectedState}
                onClick={() => setSelectedState(state)}
              >
                {`${label} (${annotationsIn(state, loadable.value).length})`}
              </button>
            ))}
        </div>
        <div className="actions">
          <button type="button" className="primary" onClick={onNewAnnotation}>
            + Neuer Hinweis
          </button>
          <button type="button" disabled={isImporting} onClick={importPlacesAndReload}>
            Orte aktualisieren
          </button>
        </div>
      </div>
      {importOutcome?.kind === "running" && <p role="status">Orte werden aktualisiert…</p>}
      {importOutcome?.kind === "succeeded" && <p role="status">{importOutcome.message}</p>}
      {importOutcome?.kind === "failed" && <ErrorMessages messages={importOutcome.messages} />}
      {loadable.status === "loading" && <p>Lädt…</p>}
      {loadable.status === "failed" && <ErrorMessages messages={errorMessagesOf(loadable.error)} />}
      {loadable.status === "loaded" && (
        <AnnotationTable
          annotations={annotationsIn(selectedState, loadable.value)}
          today={today}
          onEditAnnotation={onEditAnnotation}
        />
      )}
    </section>
  );
}

type AnnotationTableProps = {
  annotations: AnnotationListItem[];
  today: IsoDate;
  onEditAnnotation: (annotation: AnnotationListItem) => void;
};

function AnnotationTable({ annotations, today, onEditAnnotation }: AnnotationTableProps) {
  if (annotations.length === 0) return <p className="empty">Keine Hinweise</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Hinweis</th>
          <th>Ort</th>
          <th>Zeitraum</th>
        </tr>
      </thead>
      <tbody>
        {annotations.map((annotation) => (
          <tr key={annotation.id} onClick={() => onEditAnnotation(annotation)}>
            <td>
              {/* The row handles the click; the button only makes the row reachable by keyboard. */}
              <button type="button" className="link">
                {annotation.title}
              </button>
            </td>
            <td>
              {placeLabel({ name: annotation.placeName, subtype: annotation.placeSubtype })}
              {annotation.placeGone && <span className="badge">nicht mehr in OSM</span>}
            </td>
            <td>{formatDateRange(annotation, today)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
