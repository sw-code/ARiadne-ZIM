// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { AnnotationListItem } from "../shared/api.ts";
import { ApiError, fetchAnnotations, importPlaces } from "./api.ts";
import { AnnotationListPage } from "./AnnotationListPage.tsx";

vi.mock("./api.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api.ts")>()),
  fetchAnnotations: vi.fn(),
  importPlaces: vi.fn(),
}));

const today = "2026-10-21";

function annotationTitled(title: string, overrides: Partial<AnnotationListItem> = {}): AnnotationListItem {
  return {
    id: `id-of-${title}`,
    placeId: "node-1",
    title,
    text: "Text",
    validFrom: null,
    validTo: null,
    placeName: "Rossmann",
    placeSubtype: "chemist",
    placeGone: false,
    ...overrides,
  };
}

const sunscreen = annotationTitled("3 für 2 auf Sonnencreme", { validTo: "2026-10-31" });
const pumpkinWeek = annotationTitled("Kürbis-Woche", {
  validFrom: "2026-10-20",
  placeName: "Café am Markt",
  placeGone: true,
});
const kirmes = annotationTitled("Allerheiligenkirmes", { validFrom: "2026-11-05", placeName: "Ratskeller" });
const summerFestival = annotationTitled("Sommerfest", {
  validTo: "2026-08-31",
  placeName: null,
  placeSubtype: "fast_food",
});

const onNewAnnotation = vi.fn();
const onEditAnnotation = vi.fn();

function renderListPage(annotations: AnnotationListItem[] = [sunscreen, pumpkinWeek, kirmes, summerFestival]) {
  vi.mocked(fetchAnnotations).mockResolvedValue(annotations);
  render(<AnnotationListPage today={today} onNewAnnotation={onNewAnnotation} onEditAnnotation={onEditAnnotation} />);
}

beforeEach(() => vi.clearAllMocks());

test("the tabs count the annotations by state", async () => {
  renderListPage();

  expect(await screen.findByRole("tab", { name: "Aktiv (2)" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Geplant (1)" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Abgelaufen (1)" })).toBeInTheDocument();
});

test("the active tab is shown first and lists only the active annotations", async () => {
  renderListPage();

  expect(await screen.findByText(sunscreen.title)).toBeInTheDocument();
  expect(screen.getByText(pumpkinWeek.title)).toBeInTheDocument();
  expect(screen.queryByText(kirmes.title)).not.toBeInTheDocument();
  expect(screen.queryByText(summerFestival.title)).not.toBeInTheDocument();
});

test("a row shows the place and the date range", async () => {
  renderListPage();

  const row = (await screen.findByText(sunscreen.title)).closest("tr");

  expect(row).toHaveTextContent("Rossmann");
  expect(row).toHaveTextContent("bis 31.10.");
});

test("clicking a tab shows the annotations of that state", async () => {
  const user = userEvent.setup();
  renderListPage();

  await user.click(await screen.findByRole("tab", { name: "Geplant (1)" }));

  expect(screen.getByText(kirmes.title)).toBeInTheDocument();
  expect(screen.queryByText(sunscreen.title)).not.toBeInTheDocument();
});

test("a tab without annotations says so", async () => {
  const user = userEvent.setup();
  renderListPage([sunscreen]);

  await user.click(await screen.findByRole("tab", { name: "Geplant (0)" }));

  expect(screen.getByText("Keine Hinweise")).toBeInTheDocument();
});

test("an annotation on a place that left OSM is badged", async () => {
  renderListPage();

  const badge = await screen.findByText("nicht mehr in OSM");

  expect(badge.closest("tr")).toHaveTextContent(pumpkinWeek.title);
  expect(screen.getAllByText("nicht mehr in OSM")).toHaveLength(1);
});

test("an unnamed place is listed by its heading-cased subtype", async () => {
  const user = userEvent.setup();
  renderListPage();

  await user.click(await screen.findByRole("tab", { name: "Abgelaufen (1)" }));

  expect(screen.getByText(summerFestival.title).closest("tr")).toHaveTextContent("Fast Food");
});

test("clicking a row opens that annotation for editing", async () => {
  const user = userEvent.setup();
  renderListPage();

  await user.click(await screen.findByText(sunscreen.title));

  expect(onEditAnnotation).toHaveBeenCalledWith(sunscreen);
});

test("+ Neuer Hinweis starts a new annotation", async () => {
  const user = userEvent.setup();
  renderListPage();

  await user.click(await screen.findByRole("button", { name: "+ Neuer Hinweis" }));

  expect(onNewAnnotation).toHaveBeenCalled();
});

test("Orte aktualisieren imports the places and reports their number", async () => {
  const user = userEvent.setup();
  vi.mocked(importPlaces).mockResolvedValue({
    importedPlaceCount: 812,
    newlyGonePlaceCount: 3,
    goneMarkingSkipped: false,
  });
  renderListPage();

  await user.click(await screen.findByRole("button", { name: "Orte aktualisieren" }));

  expect(await screen.findByText("812 Orte aktualisiert")).toBeInTheDocument();
  expect(importPlaces).toHaveBeenCalledTimes(1);
});

test("while places are being imported the previous result gives way to a progress text", async () => {
  const user = userEvent.setup();
  const firstImport = { importedPlaceCount: 812, newlyGonePlaceCount: 0, goneMarkingSkipped: false };
  vi.mocked(importPlaces)
    .mockResolvedValueOnce(firstImport)
    .mockReturnValueOnce(new Promise(() => undefined));
  renderListPage();
  await user.click(await screen.findByRole("button", { name: "Orte aktualisieren" }));
  await screen.findByText("812 Orte aktualisiert");

  await user.click(screen.getByRole("button", { name: "Orte aktualisieren" }));

  expect(screen.getByText("Orte werden aktualisiert…")).toBeInTheDocument();
  expect(screen.queryByText("812 Orte aktualisiert")).not.toBeInTheDocument();
});

test("the progress text gives way to the result once the import has finished", async () => {
  const user = userEvent.setup();
  vi.mocked(importPlaces).mockResolvedValue({
    importedPlaceCount: 812,
    newlyGonePlaceCount: 0,
    goneMarkingSkipped: false,
  });
  renderListPage();

  await user.click(await screen.findByRole("button", { name: "Orte aktualisieren" }));

  expect(await screen.findByText("812 Orte aktualisiert")).toBeInTheDocument();
  expect(screen.queryByText("Orte werden aktualisiert…")).not.toBeInTheDocument();
});

test("a second import cannot be started while one is running", async () => {
  const user = userEvent.setup();
  vi.mocked(importPlaces).mockReturnValue(new Promise(() => undefined));
  renderListPage();

  await user.click(await screen.findByRole("button", { name: "Orte aktualisieren" }));

  expect(screen.getByRole("button", { name: "Orte aktualisieren" })).toBeDisabled();
});

test("an import that could not mark places as gone says so", async () => {
  const user = userEvent.setup();
  vi.mocked(importPlaces).mockResolvedValue({
    importedPlaceCount: 812,
    newlyGonePlaceCount: 0,
    goneMarkingSkipped: true,
  });
  renderListPage();

  await user.click(await screen.findByRole("button", { name: "Orte aktualisieren" }));

  expect(
    await screen.findByText("812 Orte aktualisiert – OSM-Antwort unvollständig, keine Orte als entfernt markiert"),
  ).toBeInTheDocument();
});

test("a failed import shows the server's message", async () => {
  const user = userEvent.setup();
  const message = "Aktualisierung fehlgeschlagen – bestehende Orte bleiben erhalten.";
  vi.mocked(importPlaces).mockRejectedValue(new ApiError([message]));
  renderListPage();

  await user.click(await screen.findByRole("button", { name: "Orte aktualisieren" }));

  expect(await screen.findByText(message)).toBeInTheDocument();
});

test("the list is reloaded after an import, because places may have left OSM", async () => {
  const user = userEvent.setup();
  vi.mocked(importPlaces).mockResolvedValue({
    importedPlaceCount: 812,
    newlyGonePlaceCount: 1,
    goneMarkingSkipped: false,
  });
  renderListPage();

  await user.click(await screen.findByRole("button", { name: "Orte aktualisieren" }));
  await screen.findByText("812 Orte aktualisiert");

  expect(fetchAnnotations).toHaveBeenCalledTimes(2);
});

test("a list that cannot be loaded shows the server's message", async () => {
  vi.mocked(fetchAnnotations).mockRejectedValue(new ApiError(["Datenbank nicht erreichbar"]));
  render(<AnnotationListPage today={today} onNewAnnotation={onNewAnnotation} onEditAnnotation={onEditAnnotation} />);

  expect(await screen.findByText("Datenbank nicht erreichbar")).toBeInTheDocument();
});
