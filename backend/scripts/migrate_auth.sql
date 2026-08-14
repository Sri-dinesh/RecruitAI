-- 1. Add user_id column (allowing null temporarily)
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;
ALTER TABLE resume_chunks ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;

-- 2. Update existing data to belong to your user (the first user created in auth.users)
UPDATE chat_sessions SET user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE resume_chunks SET user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;

-- 3. Now make the column NOT NULL to enforce data integrity
ALTER TABLE chat_sessions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE resume_chunks ALTER COLUMN user_id SET NOT NULL;

-- 4. Recreate the RPC function to support user_id filtering
create or replace function match_resume_chunks (
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  filter_candidate_id text default null,
  filter_user_id uuid default null
) returns table (
  id uuid,
  candidate_id text,
  candidate_name text,
  chunk_text text,
  similarity float
)
language sql stable
as $$
  select
    resume_chunks.id,
    resume_chunks.candidate_id,
    resume_chunks.candidate_name,
    resume_chunks.chunk_text,
    1 - (resume_chunks.embedding <=> query_embedding) as similarity
  from resume_chunks
  where 1 - (resume_chunks.embedding <=> query_embedding) > match_threshold
    and (filter_candidate_id is null or resume_chunks.candidate_id = filter_candidate_id)
    and (filter_user_id is null or resume_chunks.user_id = filter_user_id)
  order by resume_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- 5. Notify PostgREST to reload the schema cache so the API recognizes the new column
NOTIFY pgrst, 'reload schema';
