# CBRE Parser v1.8 Diagnostic Patch

운영 환경의 `source_document_pages.extracted_text` 순서가 로컬 PDF 추출 결과와 달라 v1.7이 품질검사에서 `건물 28 / 공실 25`로 중단된 문제를 진단하기 위한 패치입니다.

## 무엇이 추가되었나
- CBRE 문서 상세 화면의 `원본 자료 정보` 영역에 **CBRE 진단 원문 다운로드** 버튼 추가
- 관리자 로그인 상태에서만 접근 가능
- 운영 DB에 저장된 실제 `TEXT-EXTRACT-v1.0.0` 결과 중 진단에 필요한 최대 120개 페이지를 JSON으로 다운로드
- 문서/Run 메타데이터, marker count, 실제 `extracted_text`를 포함
- DB schema 변경 없음, SQL 실행 없음

## 적용 후
1. Vercel Ready
2. CBRE 문서 상세 화면 `Ctrl+F5`
3. `CBRE 진단 원문 다운로드` 클릭
4. 다운로드된 `*-production-text-diagnostic.json` 파일을 ChatGPT 대화에 업로드

그 파일을 기준으로 production unpdf text stream 자체에 맞춘 Parser를 수정해야 합니다. v1.7 상태에서 자동매칭/변경검수/승인은 진행하지 마세요.
