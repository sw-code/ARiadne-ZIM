// AsyncStorage is a native module with no implementation under Node, so tests use the official
// in-memory mock the package ships. Registered globally so any test rendering persistent state works.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// expo-crypto's randomUUID is native and returns nothing under Node. Node's own implementation yields
// the same version 4 UUIDs, so tests see real, distinct install IDs.
jest.mock("expo-crypto", () => ({
  randomUUID: () => require("crypto").randomUUID(),
}));
