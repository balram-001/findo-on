-- =========================================================================
-- 1. EXTENSION SETUP
-- Enable Trigram Extension for Fast String/ILIKE Searches
-- =========================================================================
create extension if not exists pg_trgm;

-- =========================================================================
-- 2. TABLE DEFINITION
-- Pre-cached Active Leads Table
-- =========================================================================
create table if not exists public.active_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  category text not null default 'General',
  industry text not null default 'General',
  city text not null default 'General',
  phone text not null default '',
  phone_type text not null default 'Missing',
  is_whatsapp boolean not null default false,
  website text,
  gstin text,
  whatsapp_link text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Composite Unique Constraint required for Python Upsert operations
  constraint active_leads_company_city_phone_key unique (company_name, city, phone)
);

-- Data provenance for phone enrichment. Existing databases need ALTER TABLE
-- because create table above only affects fresh installs.
alter table public.active_leads
  add column if not exists phone_source text not null default 'maps_fallback',
  add column if not exists phone_verified_at timestamptz;

-- =========================================================================
-- 3. AUTO UPDATED_AT TIMESTAMP TRIGGER
-- Updates 'updated_at' column whenever a row is modified
-- =========================================================================
create or replace function public.set_active_leads_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists active_leads_set_updated_at on public.active_leads;
create trigger active_leads_set_updated_at 
before update on public.active_leads
for each row execute function public.set_active_leads_updated_at();

-- =========================================================================
-- 4. ULTRA-FAST SEARCH INDEXES
-- Optimizes ILIKE Queries for Sub-Second Responses (< 100ms)
-- =========================================================================
-- Normalized exact/prefix lookup index
create index if not exists active_leads_city_category_lower_idx
  on public.active_leads (lower(city), lower(category));

-- Trigram Indexes for fast pattern matching (ILIKE '%search%')
create index if not exists active_leads_city_trgm_idx 
  on public.active_leads using gin (lower(city) gin_trgm_ops);

create index if not exists active_leads_category_trgm_idx 
  on public.active_leads using gin (lower(category) gin_trgm_ops);

create index if not exists active_leads_industry_trgm_idx 
  on public.active_leads using gin (lower(industry) gin_trgm_ops);

create index if not exists active_leads_company_trgm_idx 
  on public.active_leads using gin (lower(company_name) gin_trgm_ops);

-- =========================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures API route & public app can read/write seamlessly
-- =========================================================================
alter table public.active_leads enable row level security;

-- Drop existing policies if any
drop policy if exists "public can read active_leads" on public.active_leads;
drop policy if exists "public can insert active_leads" on public.active_leads;
drop policy if exists "public can update active_leads" on public.active_leads;
drop policy if exists "public can delete active_leads" on public.active_leads;

-- Create fresh open policies for anon & authenticated roles
create policy "public can read active_leads" 
  on public.active_leads for select to anon, authenticated using (true);

create policy "public can insert active_leads" 
  on public.active_leads for insert to anon, authenticated with check (true);

create policy "public can update active_leads" 
  on public.active_leads for update to anon, authenticated using (true) with check (true);

create policy "public can delete active_leads" 
  on public.active_leads for delete to anon, authenticated using (true);
