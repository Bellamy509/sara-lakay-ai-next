CREATE TABLE IF NOT EXISTS "temp_file" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"file_path" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Index pour nettoyer efficacement les fichiers expirés
CREATE INDEX IF NOT EXISTS "temp_file_expires_at_idx" ON "temp_file" ("expires_at");

-- Index pour accès rapide par ID
CREATE INDEX IF NOT EXISTS "temp_file_id_idx" ON "temp_file" ("id"); 