-- Taom reytingi (Supabase -> SQL Editor -> Run). Ball faqat egasi "Tasdiqlash" bosganda qo'shiladi.
create table if not exists taom_reyting (
  id text primary key,
  n integer not null default 0
);
alter table taom_reyting enable row level security;

create or replace function reyting_qosh(ids text[]) returns void
language sql as $$
  insert into taom_reyting (id, n) select unnest(ids), 1
  on conflict (id) do update set n = taom_reyting.n + 1;
$$;
