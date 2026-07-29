import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema.ts";

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseConfig = { databaseUrl: string; caCertificatePath: string | null };

// Both the source tree (src/server/database) and the production image (/app/src/server/database)
// keep the migrations three levels up.
const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

export function connectDatabase(config: DatabaseConfig): { db: Database; close: () => Promise<void> } {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.caCertificatePath === null ? undefined : verifyCertificateAuthorityOnly(config.caCertificatePath),
  });
  // A failover or restart of pg_01 kills idle clients. Without a listener that `error` event is unhandled and takes
  // the whole process down; with one, the pool just discards the client and connects anew on the next query.
  pool.on("error", (error) => console.error("[database] idle client failed", error));
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

// pg_01 uses verify-ca: its certificate names a node IP, so the chain is checked against the CA but the hostname is not.
function verifyCertificateAuthorityOnly(caCertificatePath: string) {
  return { ca: readFileSync(caCertificatePath, "utf8"), checkServerIdentity: () => undefined };
}

export async function migrateDatabase(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder });
}
