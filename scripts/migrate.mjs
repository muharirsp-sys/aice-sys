// Jalankan migrasi Drizzle saat container start (idempotent).
// Memakai migrator drizzle-orm (dependency production) — tidak butuh drizzle-kit.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const url = process.env.DATABASE_URL || "/data/aice.db";
const sqlite = new Database(url);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });
console.log(`[migrate] applied -> ${url}`);
sqlite.close();
