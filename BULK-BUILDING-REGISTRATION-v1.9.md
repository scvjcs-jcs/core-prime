# CORE PRIME — 신규 건물 일괄등록 v1.9

CBRE 구조화/자동매칭 후 수백 개 신규 후보를 하나씩 등록해야 하는 문제를 개선한 패치입니다.

## 추가 기능
- `NEW_CANDIDATE`만 안전 일괄 선택 가능
- `REVIEW_REQUIRED`/유사 후보는 일괄등록 자동 제외
- 등록 직전 canonical DB의 `normalized_name`/`road_address` exact 중복 재검사
- exact 기존 건물 1개면 새로 만들지 않고 기존 건물로 재연결
- exact 후보가 여러 개면 자동 생성하지 않고 REVIEW_REQUIRED로 보류
- 신규 건물은 `is_published=false`로 생성
- 건물별 실패는 전체 일괄 작업을 롤백하지 않고 실패건수로 집계
- 일괄등록 후 Staging listing의 `matched_building_id`도 연결

## 적용
1. 프로젝트 파일 덮어쓰기 후 GitHub Push / Vercel Ready
2. Supabase SQL Editor에서 아래 파일을 1회 실행
   - `supabase/migrations/20260914f_bulk_create_staging_buildings.sql`
3. CBRE 관리자 상세화면 새로고침
4. `안전 신규후보 전체 선택` → `일괄 신규등록`
5. 남은 `확인 필요` 후보만 수동 연결/등록
6. 미매칭 건물이 0이 되면 `3. 공실 변경사항 계산`

**주의:** 최종 승인·반영은 변경사항 계산과 충돌 검수까지 끝난 뒤 실행합니다.
