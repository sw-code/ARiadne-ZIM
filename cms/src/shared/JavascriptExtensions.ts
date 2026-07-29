export function chunked<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    chunks.push(items.slice(start, start + chunkSize));
  }
  return chunks;
}

// Groups and the items within them keep the order in which they were first seen. The type promises every group at
// least one item, so callers can destructure the first one without an undefined check.
export function groupedBy<Item, Key>(items: Item[], keyOf: (item: Item) => Key): Map<Key, [Item, ...Item[]]> {
  const groups = new Map<Key, [Item, ...Item[]]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
}

export function snakeCaseToHeadingCase(snakeCase: string): string {
  return snakeCase
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function nullIfEmpty(text: string): string | null {
  return text === "" ? null : text;
}

// Lets "cafe" find "Café": editors rarely type accents when they search. Decomposing first (NFD) turns every accented
// letter into its base letter plus a combining mark, and the marks are what gets stripped.
export function foldedForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}
