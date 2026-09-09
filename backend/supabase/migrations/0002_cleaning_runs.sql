create table if not exists public.cleaning_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  dataset_version_id uuid not null references public.dataset_versions(id) on delete cascade,
  status text not null check (status in ('proposed', 'applied', 'rejected')),
  source_hash text not null,
  plan jsonb not null default '{}'::jsonb,
  result jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cleaning_runs_dataset_version_idx on public.cleaning_runs(dataset_version_id, created_at desc);
alter table public.cleaning_runs enable row level security;
create policy "cleaning runs owner select" on public.cleaning_runs for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "cleaning runs owner insert" on public.cleaning_runs for insert to authenticated with check (created_by = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "cleaning runs owner update" on public.cleaning_runs for update to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
