import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

// Railway injects env vars at runtime. Debug: log available keys on start.
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not found. Available env keys:", Object.keys(process.env).filter(k => !k.startsWith("npm_")).join(", "));
  throw new Error("DATABASE_URL is not set in environment");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

export * from "./schema.js";
