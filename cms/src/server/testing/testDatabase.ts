import { afterAll, beforeAll, beforeEach } from "vitest";
import { connectDatabase, migrateDatabase, type Database } from "../database/connection.ts";

export const testDatabaseUrl =
  process.env["CMS_TEST_DATABASE_URL"] ?? "postgres://cms:cms@localhost:5435/ariadne_cms_test";

export function useTestDatabase(): () => Database {
  const connection = connectDatabase({
    databaseUrl: testDatabaseUrl,
    caCertificatePath: null,
  });

  beforeAll(() => migrateDatabase(connection.db));
  beforeEach(async () => {
    await connection.db.execute("truncate annotations, places, walk_reports");
  });
  afterAll(() => connection.close());

  return () => connection.db;
}
