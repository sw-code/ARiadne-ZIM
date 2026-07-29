import React, { createContext, useCallback, useContext, useMemo } from "react";
import { log } from "@/src/shared/Logger";
import { commonPointOfInterestSubtypeList } from "@/src/shared/poiSubtypes";
import { recordWithSwappedValues } from "@/src/shared/JavascriptExtensions";
import { usePersistentState } from "@/src/shared/ReactExtensions";

// Dwell time is the single source of truth: it drives the sort order everywhere, it is what the
// Settings list shows, gaze grows it, and manual reordering swaps it between neighbours.

// One real second of gaze adds one second of dwell. Since the seed spans only 20s across all types
// (spaced ~0.2s apart), a couple of seconds of gaze visibly reorders the list.
const LEARN_RATE_PER_SECOND = 1;

// The top curated type starts here; the rest fan out down to just above zero (kept intentionally
// small so gaze quickly overtakes the seed and the dynamic behaviour is noticeable).
const MAX_INITIAL_DWELL_SECONDS = 20;

// Dwell for subtypes first seen at runtime: a small positive default so they sort below every
// curated type yet never read as a bare "0s".
const DISCOVERED_SUBTYPE_DWELL_SECONDS = 0.1;

export type UserProfile = {
  dwellSecondsOf: (subtype: string) => number;
  orderedSubtypes: () => string[];
  moveUp: (subtype: string) => void;
  moveDown: (subtype: string) => void;
  addDwellSeconds: (subtype: string, seconds: number) => void;
  registerSubtypes: (subtypes: string[]) => void;
  reset: () => void;
};

export const DWELL_SECONDS_STORAGE_KEY = "userProfile.dwellSeconds";

type SubtypeDwellSeconds = Record<string, number>;

// Seeds every curated subtype with a distinct, descending dwell time derived from its position in
// the curated interest ranking, fanned out evenly over MAX_INITIAL_DWELL_SECONDS. This makes the
// initial Settings order fully predictable, every type's initial time unique, and (because values
// are distinct) manual reordering always changes the order.
function seedDwellSeconds(): SubtypeDwellSeconds {
  const dwellSeconds: SubtypeDwellSeconds = {};
  const subtypes = commonPointOfInterestSubtypeList;
  subtypes.forEach((subtype, index) => {
    dwellSeconds[subtype] = (MAX_INITIAL_DWELL_SECONDS * (subtypes.length - index)) / subtypes.length;
  });
  return dwellSeconds;
}

function orderSubtypesByDwell(dwellSeconds: SubtypeDwellSeconds): string[] {
  return Object.keys(dwellSeconds).sort((a, b) => dwellSeconds[b]! - dwellSeconds[a]!);
}

const UserProfileContext = createContext<UserProfile | null>(null);

export const UserProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Merging the stored record over a fresh seed keeps stored preferences while auto-seeding any
  // curated subtypes introduced after the profile was last saved (a lightweight forward migration).
  const [dwellSeconds, setDwellSeconds] = usePersistentState<SubtypeDwellSeconds>(
    DWELL_SECONDS_STORAGE_KEY,
    seedDwellSeconds,
    (stored) => ({ ...seedDwellSeconds(), ...stored }),
  );

  const dwellSecondsOf = useCallback(
    (subtype: string) => dwellSeconds[subtype] ?? DISCOVERED_SUBTYPE_DWELL_SECONDS,
    [dwellSeconds],
  );

  const orderedSubtypes = useCallback(() => orderSubtypesByDwell(dwellSeconds), [dwellSeconds]);

  const swapWithNeighbour = useCallback(
    (subtype: string, direction: -1 | 1) => {
      setDwellSeconds((previous) => {
        const ordered = orderSubtypesByDwell(previous);
        const index = ordered.indexOf(subtype);
        const neighbour = ordered[index + direction];
        if (index < 0 || neighbour === undefined) return previous;
        return recordWithSwappedValues(previous, subtype, neighbour);
      });
    },
    [setDwellSeconds],
  );

  const moveUp = useCallback((subtype: string) => swapWithNeighbour(subtype, -1), [swapWithNeighbour]);
  const moveDown = useCallback((subtype: string) => swapWithNeighbour(subtype, 1), [swapWithNeighbour]);

  const addDwellSeconds = useCallback(
    (subtype: string, seconds: number) => {
      setDwellSeconds((previous) => {
        const current = previous[subtype] ?? DISCOVERED_SUBTYPE_DWELL_SECONDS;
        return { ...previous, [subtype]: current + seconds * LEARN_RATE_PER_SECOND };
      });
    },
    [setDwellSeconds],
  );

  const registerSubtypes = useCallback(
    (subtypes: string[]) => {
      setDwellSeconds((previous) => {
        const uniqueSubtypes = [...new Set(subtypes)];
        const missing = uniqueSubtypes.filter((subtype) => !(subtype in previous));
        if (missing.length === 0) return previous;
        const next = { ...previous };
        for (const subtype of missing) next[subtype] = DISCOVERED_SUBTYPE_DWELL_SECONDS;
        return next;
      });
    },
    [setDwellSeconds],
  );

  // Discards all learned and reordered preferences, restoring the seeded defaults. The persistence
  // layer stores the seeded record just like any other change, so the reset survives a restart too.
  const reset = useCallback(() => setDwellSeconds(seedDwellSeconds()), [setDwellSeconds]);

  const profile = useMemo<UserProfile>(
    () => ({ dwellSecondsOf, orderedSubtypes, moveUp, moveDown, addDwellSeconds, registerSubtypes, reset }),
    [dwellSecondsOf, orderedSubtypes, moveUp, moveDown, addDwellSeconds, registerSubtypes, reset],
  );

  return <UserProfileContext.Provider value={profile}>{children}</UserProfileContext.Provider>;
};

export function useUserProfile(): UserProfile {
  const profile = useContext(UserProfileContext);
  if (!profile) {
    log.error("No UserProfile provided. Wrap your app in <UserProfileProvider>.");
    throw new Error("No UserProfile provided. Wrap your app in <UserProfileProvider>.");
  }
  return profile;
}
