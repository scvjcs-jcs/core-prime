# CORE PRIME CBRE Parser v1.3 hotfix

## What this fixes
- Ensures the semantic action selects the completed TEXT-EXTRACT run for the same parser type (CBRE).
- Makes CBRE title detection robust when unpdf flattens visual lines into one text stream.
- Adds a flattened-table fallback so vacancy rows can still be parsed when table line breaks disappear.
- Keeps the old staging result untouched if parsing fails, but marks it as an old parser result in the admin UI.
- Disables matching/diff/approval while stale staging is displayed.
- Refreshes the admin page automatically after a successful structure/match/diff action.
- Adds better parse failure diagnostics (DONE page count / Office|For Lease detection).
- Parser version: CBRE-v1.3.0.

## Apply
No SQL is required.
1. Copy this project over the current project (or copy the changed files listed below).
2. GitHub Desktop: Commit -> Push origin.
3. Wait for Vercel Ready.
4. Admin import detail: Ctrl+F5.
5. Do NOT re-run the 367-page text extraction.
6. Click `1. 건물·공실 후보 만들기` again.

## Expected validation
The exact count can vary with PDF extraction, but the September 2026 CBRE package should produce hundreds of listings, not 12.
Local regression against the supplied 367-page CBRE PDF text produced:
- 232 building candidates
- 671 listing candidates
- no fake building titles matching CBRE contact names (유진석/최재성/이보라/김유진)

Do not proceed to Step 2 if listings are still abnormally low or if obvious contact names appear as buildings.

## Changed files
- src/lib/parsers/cbre/CBREParser.ts
- src/app/admin/(protected)/imports/actions.ts
- src/components/admin/ImportReviewControls.tsx
- src/app/admin/(protected)/imports/[id]/page.tsx
