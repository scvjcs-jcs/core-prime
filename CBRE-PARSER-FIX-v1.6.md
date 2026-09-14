# CBRE Parser v1.6.0

실제 운영에서 v1.5.0이 367페이지 중 공실 후보 26건만 감지한 문제를 수정했습니다.

핵심 변경:
- unpdf/pdf.js가 표를 `층 -> 숫자 -> 숫자 -> 숫자 -> 숫자`의 text-item stream으로 저장하는 경우 직접 파싱
- 한 페이지 공통 입주시기/임대료/관리비를 해당 페이지의 공실 행에 적용
- 기존 line parser + token-stream parser + flattened parser를 병행하고 중복 제거
- 건물명/기존 staging 안전장치는 그대로 유지
- PDF 원문 추출 재실행 불필요

적용 후 관리자에서 `1. 건물·공실 후보 만들기`만 다시 실행하세요.

로컬 회귀 테스트 (실제 CBRE September 2026 PDF, 367p / pdftotext stream):
- buildings: 231
- listings: 598
- warnings: 238
- EUL Tower: 15 listings, page-wide rent/management/move-in propagation verified

주의: 운영 unpdf text order는 pdftotext와 다를 수 있으므로, 배포 후 관리자에서 재구조화 결과를 반드시 확인합니다. 품질검사(<50 listings)는 계속 유지됩니다.
