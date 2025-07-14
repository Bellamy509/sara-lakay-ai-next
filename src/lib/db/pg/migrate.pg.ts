import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "path";
import postgres from "postgres";
import "load-env";

// Use direct database connection string
const connectionString = process.env.DATABASE_URL!;

// Create the PostgreSQL client for migrations
const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

export async function runMigrations() {
  await migrate(db, {
    migrationsFolder: join(__dirname, "..", "..", "..", "migrations"),
  });
  await sql.end();
}
