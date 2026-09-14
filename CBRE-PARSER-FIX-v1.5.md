# CBRE Parser v1.5.0

실제 운영에서 저장된 `unpdf/pdf.js` 원문 순서를 기준으로 수정했습니다.

## 원인
PDF 화면상 제목 순서와 PDF 내부 text item 순서가 달랐습니다. 실제 추출 원문은 다음처럼 저장될 수 있습니다.

`Office` → `|` → `For Lease` → `Availabilities` → `Building Image` → `General Information` → `CBRE Contacts` → `EUL Tower` → `이을타워` → `주소` ...

따라서 기존처럼 `Office | For Lease` 바로 뒤에서 건물명을 찾으면 0건이 됩니다.

## 수정
- 페이지 전체 text item에서 영문명 + 한글명 인접 쌍을 탐색
- `주소` 직전 영문 단독 공식명(G1 Seoul 등) 지원
- 연락처, 직급, 이메일, 섹션명, 주석을 건물명 후보에서 제외
- continuation 페이지는 이전 건물명을 유지
- 기존 367페이지 원문 추출 결과를 그대로 재사용

## 검증
실제 CBRE September 2026 PDF를 pdf.js와 유사한 text-item 순서로 재구성해 점검:
- Office | For Lease 페이지: 359
- 제목 감지: 359/359
- 고유 건물 후보: 약 237
- 공실 행 후보: 약 456

실제 Supabase `unpdf` 결과와 세부 item 분할 차이에 따라 최종 수치는 조금 달라질 수 있습니다.
