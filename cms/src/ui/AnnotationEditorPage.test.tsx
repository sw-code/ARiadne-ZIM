// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { maxAnnotationTextCharacters, maxAnnotationTitleCharacters } from "../shared/annotationLimits.ts";
import type { AnnotationListItem, PlaceSummary } from "../shared/api.ts";
import { ApiError, deleteAnnotation, fetchPlaces, saveAnnotation } from "./api.ts";
import { AnnotationEditorPage } from "./AnnotationEditorPage.tsx";

// jsdom has no WebGL, which MapLibre needs.
vi.mock("./PlaceMap.tsx", () => ({ PlaceMap: () => null }));
vi.mock("./api.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api.ts")>()),
  fetchPlaces: vi.fn(),
  saveAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
}));

function placeWithId(id: string, overrides: Partial<PlaceSummary> = {}): PlaceSummary {
  return {
    id,
    name: null,
    category: "shop",
    subtype: "chemist",
    latitude: 51.57,
    longitude: 8.1,
    address: null,
    gone: false,
    ...overrides,
  };
}

const rossmann = placeWithId("node-1", { name: "Rossmann", address: "Brüderstraße 19" });
const cafe = placeWithId("node-2", { name: "Café am Markt", subtype: "cafe" });
const placeThatLeftOsm = placeWithId("node-3", { name: "Schlecker", gone: true });

const existingAnnotation: AnnotationListItem = {
  id: "annotation-1",
  placeId: "node-1",
  title: "3 für 2 auf Sonnencreme",
  text: "Nur diese Woche",
  validFrom: "2026-10-20",
  validTo: "2026-10-31",
  placeName: "Rossmann",
  placeSubtype: "chemist",
  placeGone: false,
};

const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPlaces).mockResolvedValue([rossmann, cafe, placeThatLeftOsm]);
  vi.mocked(saveAnnotation).mockResolvedValue({ ...existingAnnotation });
  vi.mocked(deleteAnnotation).mockResolvedValue();
});

test("a new annotation starts with the place picker", async () => {
  render(<AnnotationEditorPage annotation={null} onClose={onClose} />);

  expect(await screen.findByRole("heading", { name: "Ort wählen" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Titel")).not.toBeInTheDocument();
});

test("places that left OSM cannot be picked for a new annotation", async () => {
  render(<AnnotationEditorPage annotation={null} onClose={onClose} />);

  expect(await screen.findByText("Rossmann")).toBeInTheDocument();
  expect(screen.queryByText("Schlecker")).not.toBeInTheDocument();
});

test("picking a place and filling in the form saves a new annotation", async () => {
  const user = userEvent.setup();
  render(<AnnotationEditorPage annotation={null} onClose={onClose} />);

  await user.click(await screen.findByText("Rossmann"));
  await user.type(screen.getByLabelText("Titel"), "3 für 2");
  await user.type(screen.getByLabelText("Text"), "Nur diese Woche");
  await user.type(screen.getByLabelText("Gültig bis"), "2026-10-31");
  await user.click(screen.getByRole("button", { name: "Speichern" }));

  expect(saveAnnotation).toHaveBeenCalledWith(
    { placeId: "node-1", title: "3 für 2", text: "Nur diese Woche", validFrom: null, validTo: "2026-10-31" },
    null,
  );
  expect(onClose).toHaveBeenCalled();
});

test("the title and the text stop accepting characters at the limits of the AR panel", async () => {
  const user = userEvent.setup();
  render(<AnnotationEditorPage annotation={null} onClose={onClose} />);
  await user.click(await screen.findByText("Rossmann"));

  await user.type(screen.getByLabelText("Titel"), "T".repeat(maxAnnotationTitleCharacters + 5));
  await user.type(screen.getByLabelText("Text"), "x".repeat(maxAnnotationTextCharacters + 5));

  expect(screen.getByLabelText("Titel")).toHaveValue("T".repeat(maxAnnotationTitleCharacters));
  expect(screen.getByLabelText("Text")).toHaveValue("x".repeat(maxAnnotationTextCharacters));
});

test("the form shows the chosen place and has nothing to delete yet", async () => {
  const user = userEvent.setup();
  render(<AnnotationEditorPage annotation={null} onClose={onClose} />);

  await user.click(await screen.findByText("Rossmann"));

  expect(screen.getByText("Rossmann")).toBeInTheDocument();
  expect(screen.getByText("leer = unbegrenzt")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Löschen" })).not.toBeInTheDocument();
});

test("a server error is shown and the form keeps its values", async () => {
  const user = userEvent.setup();
  vi.mocked(saveAnnotation).mockRejectedValue(new ApiError(["Titel fehlt"]));
  render(<AnnotationEditorPage annotation={null} onClose={onClose} />);

  await user.click(await screen.findByText("Rossmann"));
  await user.type(screen.getByLabelText("Text"), "Nur diese Woche");
  await user.click(screen.getByRole("button", { name: "Speichern" }));

  expect(await screen.findByText("Titel fehlt")).toBeInTheDocument();
  expect(screen.getByLabelText("Text")).toHaveValue("Nur diese Woche");
  expect(onClose).not.toHaveBeenCalled();
});

test("changing the place keeps what has been typed", async () => {
  const user = userEvent.setup();
  render(<AnnotationEditorPage annotation={null} onClose={onClose} />);

  await user.click(await screen.findByText("Rossmann"));
  await user.type(screen.getByLabelText("Titel"), "3 für 2");
  await user.click(screen.getByRole("button", { name: "Ort ändern" }));
  await user.click(await screen.findByText("Café am Markt"));

  expect(screen.getByLabelText("Titel")).toHaveValue("3 für 2");
  expect(screen.getByText("Café am Markt")).toBeInTheDocument();
});

test("an existing annotation opens in the form with its values", () => {
  render(<AnnotationEditorPage annotation={existingAnnotation} onClose={onClose} />);

  expect(screen.getByLabelText("Titel")).toHaveValue("3 für 2 auf Sonnencreme");
  expect(screen.getByLabelText("Text")).toHaveValue("Nur diese Woche");
  expect(screen.getByLabelText("Gültig von")).toHaveValue("2026-10-20");
  expect(screen.getByLabelText("Gültig bis")).toHaveValue("2026-10-31");
  expect(screen.getByText("Rossmann")).toBeInTheDocument();
});

test("clearing a date field saves null, not an empty string", async () => {
  const user = userEvent.setup();
  render(<AnnotationEditorPage annotation={existingAnnotation} onClose={onClose} />);

  await user.clear(screen.getByLabelText("Gültig bis"));
  await user.click(screen.getByRole("button", { name: "Speichern" }));

  expect(saveAnnotation).toHaveBeenCalledWith(
    {
      placeId: "node-1",
      title: existingAnnotation.title,
      text: existingAnnotation.text,
      validFrom: "2026-10-20",
      validTo: null,
    },
    "annotation-1",
  );
});

test("an annotation on a place that left OSM is labelled by its subtype when unnamed", () => {
  const unnamed = { ...existingAnnotation, placeName: null, placeSubtype: "fast_food", placeGone: true };
  render(<AnnotationEditorPage annotation={unnamed} onClose={onClose} />);

  expect(screen.getByText("Fast Food")).toBeInTheDocument();
});

test("deleting asks for confirmation and then deletes the annotation", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<AnnotationEditorPage annotation={existingAnnotation} onClose={onClose} />);

  await user.click(screen.getByRole("button", { name: "Löschen" }));

  expect(confirm).toHaveBeenCalledWith("Hinweis wirklich löschen?");
  expect(deleteAnnotation).toHaveBeenCalledWith("annotation-1");
  expect(onClose).toHaveBeenCalled();
});

test("declining the confirmation keeps the annotation", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<AnnotationEditorPage annotation={existingAnnotation} onClose={onClose} />);

  await user.click(screen.getByRole("button", { name: "Löschen" }));

  expect(deleteAnnotation).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test("Abbrechen closes the editor without saving", async () => {
  const user = userEvent.setup();
  render(<AnnotationEditorPage annotation={existingAnnotation} onClose={onClose} />);

  await user.click(screen.getByRole("button", { name: "Abbrechen" }));

  expect(onClose).toHaveBeenCalled();
  expect(saveAnnotation).not.toHaveBeenCalled();
});
