import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: Database.Database | undefined;
};

// Reuse the db connection across HMR reloads in dev.
const sqlite =
  globalForDb.db ??
  new Database(process.env.DATABASE_URL || "./aice.db");

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = sqlite;
}

export const db = drizzle(sqlite, { schema });
