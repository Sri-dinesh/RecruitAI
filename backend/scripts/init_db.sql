-- Enable the pgvector extension if not already enabled
create extension if not exists vector;

-- Create the resume_chunks table
create table if not exists resume_chunks (
    id uuid primary key default gen_random_uuid(),
    candidate_id text not null,
    candidate_name text not null,
    chunk_text text not null,
    embedding vector(384),  -- 384 dimensions to match all-MiniLM-L6-v2
    created_at timestamp default now()
);

-- Create an index to optimize cosine similarity searches
create index if not exists resume_chunks_embedding_idx 
on resume_chunks 
using ivfflat (embedding vector_cosine_ops);
