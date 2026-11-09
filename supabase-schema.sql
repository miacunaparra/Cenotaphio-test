create table if not exists public.user_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.user_backups enable row level security;

revoke all on table public.user_backups from anon, authenticated;
grant select, insert, update on table public.user_backups to authenticated;

drop policy if exists "Users can read their own backup" on public.user_backups;
create policy "Users can read their own backup"
  on public.user_backups for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own backup" on public.user_backups;
create policy "Users can create their own backup"
  on public.user_backups for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own backup" on public.user_backups;
create policy "Users can update their own backup"
  on public.user_backups for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.get_public_memories()
returns table (
  altar text,
  nombre text,
  tipo text,
  fecha text,
  descripcion text,
  historia text,
  foto text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    profile ->> 'nombre',
    memory ->> 'nombre',
    memory ->> 'tipo',
    memory ->> 'fecha',
    memory ->> 'descripcion',
    memory ->> 'historia',
    memory ->> 'foto'
  from public.user_backups as backup
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(backup.payload -> 'perfiles') = 'array'
        then backup.payload -> 'perfiles'
      else '[]'::jsonb
    end
  ) as profiles(profile)
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(profile -> 'objetos') = 'array'
        then profile -> 'objetos'
      else '[]'::jsonb
    end
  ) as memories(memory)
  where profile -> 'privado' is distinct from 'true'::jsonb
    and jsonb_typeof(memory) = 'object'
    and jsonb_typeof(memory -> 'nombre') = 'string';
$$;

revoke all on function public.get_public_memories() from public, anon, authenticated;
grant execute on function public.get_public_memories() to anon, authenticated;
