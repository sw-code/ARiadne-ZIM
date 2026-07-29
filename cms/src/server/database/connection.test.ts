import { sql } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { testDatabaseUrl } from "../testing/testDatabase.ts";
import { connectDatabase } from "./connection.ts";

test("an idle connection dropped by the server is logged instead of crashing the process", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { db, close } = connectDatabase({ databaseUrl: testDatabaseUrl, caCertificatePath: null });
  try {
    const { rows } = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);

    // A second connection plays the failover: it kills the pool's idle client from the outside.
    const killer = connectDatabase({ databaseUrl: testDatabaseUrl, caCertificatePath: null });
    try {
      await killer.db.execute(sql`select pg_terminate_backend(${rows[0]?.pid})`);
      await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    } finally {
      await killer.close();
    }
  } finally {
    await close();
    consoleError.mockRestore();
  }
});
