// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { PlaceSummary } from "../shared/api.ts";
import { PlaceMap } from "./PlaceMap.tsx";
import { PlacePicker } from "./PlacePicker.tsx";

// jsdom has no WebGL, which MapLibre needs.
vi.mock("./PlaceMap.tsx", () => ({ PlaceMap: vi.fn(() => null) }));

beforeEach(() => vi.clearAllMocks());

const propsOfMap = () => vi.mocked(PlaceMap).mock.lastCall?.[0];

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

const rossmannOnBruederstrasse = placeWithId("node-1", { name: "Rossmann", address: "Brüderstraße 19" });
const rossmannWithoutAddress = placeWithId("node-2", { name: "Rossmann" });
const cafe = placeWithId("node-3", { name: "Café am Markt", subtype: "cafe" });
const unnamedFastFood = placeWithId("node-4", { subtype: "fast_food" });
const places = [rossmannOnBruederstrasse, rossmannWithoutAddress, cafe, unnamedFastFood];

function renderPicker(pickablePlaces: PlaceSummary[] = places, onSelect = vi.fn()) {
  render(<PlacePicker places={pickablePlaces} selectedPlaceId={null} onSelect={onSelect} />);
  return { onSelect };
}

test("asks the editor to choose a place", () => {
  renderPicker();

  expect(screen.getByRole("heading", { name: "Ort wählen" })).toBeInTheDocument();
});

test("searching filters the places case-insensitively", async () => {
  const user = userEvent.setup();
  renderPicker();

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "ross");

  const entries = screen.getAllByRole("listitem");
  expect(entries).toHaveLength(2);
  entries.forEach((entry) => expect(entry).toHaveTextContent("Rossmann"));
});

test("searching ignores accents, so that cafe finds Café", async () => {
  const user = userEvent.setup();
  renderPicker();

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "CAFE");

  expect(screen.getByRole("listitem")).toHaveTextContent("Café am Markt");
});

test("searching an accent finds the unaccented name", async () => {
  const user = userEvent.setup();
  renderPicker([placeWithId("node-5", { name: "Cafe Central" })]);

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "café");

  expect(screen.getByRole("listitem")).toHaveTextContent("Cafe Central");
});

test("searching a street finds the place at that address", async () => {
  const user = userEvent.setup();
  renderPicker();

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "bruderstr");

  expect(screen.getByRole("listitem")).toHaveTextContent("Rossmann");
  expect(screen.getByRole("listitem")).toHaveTextContent("Brüderstraße 19");
});

test("a street search also moves the map to the places at that address", async () => {
  const user = userEvent.setup();
  renderPicker();

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "Brüderstraße");

  expect(propsOfMap()).toMatchObject({ places: [rossmannOnBruederstrasse], shouldFitToPlaces: true });
});

test("an entry shows the address of its place", () => {
  renderPicker();

  expect(screen.getByText("Brüderstraße 19")).toBeInTheDocument();
});

test("an entry without an address has no address line", () => {
  renderPicker([rossmannWithoutAddress]);

  expect(screen.getByRole("listitem")).toHaveTextContent(/^Rossmann$/);
});

test("an unnamed place is listed by its heading-cased subtype and found by it", async () => {
  const user = userEvent.setup();
  renderPicker();

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "fast");

  expect(screen.getByRole("listitem")).toHaveTextContent("Fast Food");
});

test("clicking an entry selects its place", async () => {
  const user = userEvent.setup();
  const { onSelect } = renderPicker();

  await user.click(screen.getByText("Café am Markt"));

  expect(onSelect).toHaveBeenCalledWith("node-3");
});

test("at most 50 matches are listed", () => {
  const manyPlaces = Array.from({ length: 60 }, (_, index) =>
    placeWithId(`node-${index}`, { name: `Bäckerei ${index}` }),
  );
  renderPicker(manyPlaces);

  expect(screen.getAllByRole("listitem")).toHaveLength(50);
});

test("the map shows all places, without fitting to them, while the search is empty", () => {
  renderPicker();

  expect(propsOfMap()).toMatchObject({ places, shouldFitToPlaces: false });
});

test("the map shows exactly the places matching the search and fits to them", async () => {
  const user = userEvent.setup();
  renderPicker();

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "ross");

  expect(propsOfMap()).toMatchObject({
    places: [rossmannOnBruederstrasse, rossmannWithoutAddress],
    shouldFitToPlaces: true,
  });
});

test("the map shows all places again once the search is cleared", async () => {
  const user = userEvent.setup();
  renderPicker();

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "ross");
  await user.clear(screen.getByPlaceholderText("Ort suchen…"));

  expect(propsOfMap()).toMatchObject({ places, shouldFitToPlaces: false });
});

test("the map shows every match, not just the 50 that are listed", async () => {
  const user = userEvent.setup();
  const manyPlaces = Array.from({ length: 60 }, (_, index) =>
    placeWithId(`node-${index}`, { name: `Bäckerei ${index}` }),
  );
  renderPicker(manyPlaces);

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "bäcker");

  expect(propsOfMap()?.places).toHaveLength(60);
});

test("a search of only spaces does not count as a search", async () => {
  const user = userEvent.setup();
  renderPicker();

  await user.type(screen.getByPlaceholderText("Ort suchen…"), "  ");

  expect(propsOfMap()).toMatchObject({ places, shouldFitToPlaces: false });
});
