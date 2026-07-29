import { useState } from "react";
import type { AnnotationListItem } from "../shared/api.ts";
import { todayInSoest } from "../shared/annotationState.ts";
import { AnnotationEditorPage } from "./AnnotationEditorPage.tsx";
import { AnnotationListPage } from "./AnnotationListPage.tsx";

type View = { kind: "list" } | { kind: "edit"; annotation: AnnotationListItem | null };

export function App() {
  const [view, setView] = useState<View>({ kind: "list" });

  return (
    <>
      <header className="app-header">
        <h1>ARiadne CMS · Soest</h1>
      </header>
      <main>
        {view.kind === "list" ? (
          <AnnotationListPage
            today={todayInSoest(new Date())}
            onNewAnnotation={() => setView({ kind: "edit", annotation: null })}
            onEditAnnotation={(annotation) => setView({ kind: "edit", annotation })}
          />
        ) : (
          <AnnotationEditorPage annotation={view.annotation} onClose={() => setView({ kind: "list" })} />
        )}
      </main>
    </>
  );
}
