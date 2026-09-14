# CBRE v1.8.1 merged verification build

This build combines:
- the uploaded `CBRE-v1.8.0` parser fixes (split `| For Lease`, split floor/unit lines), and
- the production-text diagnostic download feature from the diagnostic v1.8 package.

No DB schema or SQL changes are required for this merge.

Recommended workflow:
1. Deploy this build.
2. Do not approve/match the old staging result.
3. First run `건물·공실 후보 만들기` once.
4. If the result is still below the quality gate, use `CBRE 진단 원문 다운로드` and upload the JSON for exact production-text simulation.

Local regression checks performed:
- TypeScript parser compile: pass.
- CBRE 367-page plain extraction: 231 buildings / 513 listings.
- CBRE 367-page layout extraction: 233 buildings / 573 listings.
- Synthetic `Office\n| For Lease` stress: stable 233 buildings / 573 listings.
- Synthetic split floor-unit lines: parser remains operational; some row-count sensitivity remains, so production diagnostic is retained.
