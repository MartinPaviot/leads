-- Add generated tsvector column for full-text search on embeddings.content
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS embeddings_search_vector_idx
  ON embeddings USING gin(search_vector);
