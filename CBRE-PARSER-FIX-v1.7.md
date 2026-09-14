# CBRE Parser v1.7.0 - repeated simulation hardening

v1.6.0 배포 전 재검증 과정에서 발견된 중복/오인식 가능성을 수정한 버전입니다.

## 핵심 수정
- `공실 뒷장 참고`가 있는 건물 개요 페이지에서는 공실 행을 생성하지 않음
- line parser가 성공하면 token-stream/flattened parser를 중복 결합하지 않고 fallback으로만 사용
- `지상 14층`/`14층`처럼 동일 공실이 두 번 생성되는 문제 방지
- `sqm`, `B6 / 9F 엘리베이터`, 주소, 지하철 노선, 담당자 직급 등을 건물명으로 오인하지 않도록 차단
- 실제 건물 영문+한글 제목에 우선 점수를 부여
- 대형 CBRE 문서 품질 게이트 강화: 300p 이상이면 건물 150개 이상 + 공실 200건 이상이 아니면 기존 staging 보존 후 중단

## 반복 시뮬레이션
실제 `CBRE_Office Leasing Flyer_September2026.pdf` 367페이지를 대상으로 5가지 텍스트 추출 형태에서 테스트했습니다.
- pdftotext default: 건물 231 / 공실 513
- pdftotext layout: 건물 233 / 공실 573
- pdftotext raw: 건물 233 / 공실 572
- PyMuPDF raw: 건물 233 / 공실 552
- PyMuPDF sorted: 건물 233 / 공실 544

텍스트 추출 순서가 달라도 건물 수는 231~233, 공실은 513~573 범위로 유지되었습니다.

## 대표 회귀 테스트 (pdftotext raw)
- EUL Tower 이을타워: 15
- Seoul Finance Center 서울파이낸스센터: 4
- Centropolis 센트로폴리스: 8
- Gran Seoul Tower 1 그랑서울 타워1: 5
- Tower 107 타워107: 3
- Seoul 707 Tower 서울707타워: 17
- Pixel Cube 픽셀큐브: 13
- Base Seongsu 베이스 성수: 5
- TL Tower TL타워: 19

위 항목 모두 실제 PDF의 공실표 행 수와 대조해 PASS했습니다.

## 결정성 테스트
pdftotext raw, PyMuPDF raw 입력을 각각 5회 연속 실행하여 결과 SHA-256이 매회 동일함을 확인했습니다.

## 운영 주의
운영 환경의 `unpdf` 저장 텍스트 순서는 위 추출기와 완전히 동일하다고 보장할 수 없습니다. 따라서 배포 후 첫 재구조화 결과에서 건물/공실 수와 대표 건물 몇 건을 관리자 화면에서 확인한 뒤 자동매칭을 진행하세요.
