-- Banket eslatmalari takrorlanmasligi uchun jadval (Supabase -> SQL Editor -> Run)
create table if not exists banket_eslatma (
  banket_id bigint not null,
  kind text not null,
  ts double precision,
  primary key (banket_id, kind)
);
alter table banket_eslatma enable row level security;
