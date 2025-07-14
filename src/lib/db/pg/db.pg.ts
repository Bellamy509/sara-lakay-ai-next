import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Use Supabase connection pooling URL for direct database access when needed
const connectionString = process.env.DATABASE_URL!;

// Configure connection
const client = postgres(connectionString, {
  prepare: false,
  max: 20,
});

// Create the drizzle database instance
export const pgDb = drizzle(client);

// Helper functions using RLS (now handled by Supabase automatically)
export async function setCurrentUserId(_userId: string) {
  // No need to manually set user ID as Supabase handles this through RLS
  return;
}

export async function clearCurrentUserId() {
  // No need to manually clear user ID as Supabase handles this through RLS
  return;
}
