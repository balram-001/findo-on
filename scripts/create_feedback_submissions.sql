create table if not exists public.feedback_submissions (
  id bigint generated always as identity primary key,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 1 and 2000),
  name text,
  email text,
  created_at timestamptz not null default now()
);

alter table public.feedback_submissions enable row level security;
