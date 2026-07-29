// AsyncStorage is a native module with no implementation under Node, so tests use the official
// in-memory mock the package ships. Registered globally so any test rendering persistent state works.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
