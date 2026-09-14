-- 최초 관리자(SUPER_ADMIN) 계정을 등록하는 SQL입니다.
--
-- 사용 순서:
-- 1) Supabase 대시보드 > Authentication > Users 에서 "Add user" 로
--    본인 이메일/비밀번호 계정을 먼저 만듭니다. (자세한 절차는 채팅 안내 참고)
-- 2) 방금 만든 사용자를 목록에서 클릭하면 상단에 UUID(예: 5f2c1a3e-....)가 보입니다.
--    그 값을 아래 'USER_UUID_HERE' 자리에 붙여넣습니다.
-- 3) 이메일과 이름도 실제 값으로 바꾼 뒤, 이 SQL 전체를 SQL Editor에서 실행합니다.

insert into admins (id, name, email, role, is_active)
values (
  'USER_UUID_HERE',      -- ← 1번에서 복사한 UUID로 교체
  '챨스',                 -- ← 관리자 이름
  'admin@example.com',   -- ← 1번에서 만든 계정과 동일한 이메일
  'SUPER_ADMIN',
  true
)
on conflict (id) do update set
  role = excluded.role,
  is_active = true;
