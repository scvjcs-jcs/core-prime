-- CORE PRIME v1.22 · 네이버 블로그 콘텐츠 센터
-- Supabase SQL Editor에서 1회 실행하세요. 재실행해도 안전합니다.

alter table public.building_contents add column if not exists title text;
alter table public.building_contents add column if not exists platform text;
alter table public.building_contents add column if not exists template_key text;
alter table public.building_contents add column if not exists tags text[] not null default '{}';
alter table public.building_contents add column if not exists published_url text;
alter table public.building_contents add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

create index if not exists idx_building_contents_platform_status on public.building_contents(platform, status);
create index if not exists idx_building_contents_published_at on public.building_contents(published_at desc);

comment on column public.building_contents.platform is '콘텐츠 대상 플랫폼. v1.22: naver_blog';
comment on column public.building_contents.template_key is 'building_intro / vacancy_update / comparison';
comment on column public.building_contents.source_snapshot is '원고 생성 당시 검증 데이터 기준과 건물/공실 참조 스냅샷';
