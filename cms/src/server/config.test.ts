import { expect, test } from "vitest";
import { readConfig } from "./config.ts";

const requiredEnvironment = {
  DATABASE_URL: "postgres://cms:cms@localhost:5435/ariadne_cms",
  EDITOR_PASSWORD: "secret",
};

test("missing required variables are all named in a single error", () =>
  expect(() => readConfig({})).toThrow("Missing environment variables: DATABASE_URL, EDITOR_PASSWORD"));

test("only the missing required variable is named", () => {
  expect(() => readConfig({ DATABASE_URL: requiredEnvironment.DATABASE_URL })).toThrow(
    "Missing environment variables: EDITOR_PASSWORD",
  );
  expect(() => readConfig({ EDITOR_PASSWORD: "secret" })).toThrow("Missing environment variables: DATABASE_URL");
});

test("empty required variables count as missing", () =>
  expect(() => readConfig({ DATABASE_URL: "", EDITOR_PASSWORD: "" })).toThrow(
    "Missing environment variables: DATABASE_URL, EDITOR_PASSWORD",
  ));

test("optional variables fall back to their defaults", () =>
  expect(readConfig(requiredEnvironment)).toEqual({
    databaseUrl: requiredEnvironment.DATABASE_URL,
    editorPassword: "secret",
    caCertificatePath: null,
    portNumber: 8080,
    overpassUrl: "https://overpass-api.de/api/interpreter",
    uiDistPath: "dist/ui",
  }));

test("optional variables override their defaults", () =>
  expect(
    readConfig({
      ...requiredEnvironment,
      DATABASE_CA_PATH: "/etc/ca/ca.pem",
      PORT: "3000",
      OVERPASS_URL: "http://localhost:12345/interpreter",
      UI_DIST_PATH: "/app/ui",
    }),
  ).toEqual({
    databaseUrl: requiredEnvironment.DATABASE_URL,
    editorPassword: "secret",
    caCertificatePath: "/etc/ca/ca.pem",
    portNumber: 3000,
    overpassUrl: "http://localhost:12345/interpreter",
    uiDistPath: "/app/ui",
  }));
