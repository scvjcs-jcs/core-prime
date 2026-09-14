# CBRE Parser Fix v1.4

Observed production symptom after v1.3:
- 367/367 text extraction complete
- Office | For Lease detected on 359 pages
- semantic parser returned 0 new building candidates
- prior staging (262 buildings / 12 listings) remained visible

Fix:
- CBRE parser version -> CBRE-v1.4.0
- added markerSliceTitle() fallback that extracts the title directly after `Office | For Lease` even when the PDF extractor collapses page text into one stream or section whitespace differs
- keeps v1.3 staging safety: failed parsing never overwrites previous staging
- no SQL change required

Apply:
1. Overwrite project with this package.
2. GitHub Desktop Commit / Push origin.
3. Wait for Vercel Ready.
4. Ctrl+F5 in admin import detail.
5. Do NOT rerun PDF extraction.
6. Run `건물·공실 후보 만들기` again.
7. Do not run matching/approval until new counts are confirmed.
