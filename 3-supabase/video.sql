-- YouTube videolar (Supabase -> SQL Editor -> Run)
create table if not exists yt_video (
  id bigserial primary key,
  yt text not null unique,
  created double precision
);
alter table yt_video enable row level security;
