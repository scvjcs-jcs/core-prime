# CORE PRIME 최종 QA 체크리스트

## 고객 관점
- [x] 첫 화면에서 서비스 목적과 다음 행동이 명확함
- [x] 검색/비교/상담 3개 핵심 동선이 전역 메뉴에서 접근 가능
- [x] 공실이 없는 건물도 막힌 화면이 아니라 상담으로 연결
- [x] Prime Score 미평가를 0점으로 오해하지 않도록 처리
- [x] 상담폼 범위 오류 및 연락처 입력 검증
- [x] 개인정보 수집 동의 확인

## 관리자 관점
- [x] 신규 상담/검수 필요 자료/오래된 공실을 대시보드에서 우선 확인
- [x] 공실 및 고객 목록 검색/필터
- [x] PDF 원문은 private 보관
- [x] 추출 실패 페이지 재처리 가능
- [x] Staging 이후 건물 매칭 전에는 Diff 실행 제한
- [x] 충돌/미분류/종료 미결정 건이 있으면 최종 승인 제한
- [x] 최종 승인 전 실제 추출 공실값을 표로 검토 가능
- [x] 신규 건물은 비공개 생성
- [x] 기존 공실 미검출 시 자동 삭제 금지

## Parser QA
- [x] PDF viewer 기준 1-based source_page 유지
- [x] NAI 목차 제외
- [x] NAI 707타워 연속페이지 유지
- [x] NAI `공실없음` 보존
- [x] 애매한 면적 레이아웃은 임의 확정 대신 warning
- [x] CBRE 동일 건물 연속페이지 병합
- [x] C&W 목차 페이지 오인식 방지

## 운영 반영 후 꼭 볼 것
- [ ] Supabase FINAL_APPLY_ONCE.sql 성공
- [ ] Vercel production build `Ready`
- [ ] 관리자 로그인/RLS 정상
- [ ] 실제 PDF 업로드 후 signed URL 열람 정상
- [ ] 실제 NAI 1건 staging → matching → diff → 승인까지 end-to-end 확인
- [ ] 고객 `/buildings`, `/compare`, `/advisory` 모바일/PC 확인
