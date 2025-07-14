ALTER TABLE temp_file ADD COLUMN user_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE temp_file
  ADD CONSTRAINT fk_temp_file_user
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE; 