# Stage 1 artifacts: content audit and proposals

Working files behind the Stage 1 review document (September 2026). Nothing here runs in the app yet; it is the research and seed data for Stage 2.

- `taxonomy.json` — proposed stages, jobs, sub-jobs, and content types. Seed data for the taxonomy tables.
- `mapping.csv` — every Connected post, series, and question mapped to a primary sub-job, secondary sub-jobs, stages, content type, an outdated flag with reason, a one-line "why", and its Connected URL. Produced by `scripts/classify.py` (gpt-5.6-luna) and spot-checked by hand.
- `classification.json` — the raw classifier output.
- `categories.json` — Bloomfire's current category list, as returned by the API.
- `prompts/base.md` — the shared base review prompt every material type inherits.
- `prompts/types.json` — three complete material types (guide, rubric, reviewer notes).
- `drafts/` — three sample teacher-leader drafts used to test the prompts.
- `reviews_gpt-5.6-sol.json` — the real model reviews of those drafts (structured JSON, with token usage).
- `scripts/pull_catalog.py` — pulls the full Connected catalog through the Bloomfire API (needs `BLOOMFIRE_API_KEY` and a login email; exchanges them for a session token first).
- `scripts/extract_attachments.py` — downloads document attachments and extracts text for search.
- `scripts/classify.py`, `scripts/review.py` — the classifier and the review harness.

The pulled catalog itself (`catalog_full.json`, `attachment_text.json`) is not committed; it re-pulls in about a minute and is internal content.

## Bloomfire API notes

- Base URL: `https://connected.wildflowerschools.org/api/v2`.
- Auth: `POST /login` with JSON `{email, api_key}` and header `bloomfire-requested-fields: session_token`, then `Authorization: Bloomfire-Session-Token <token>` on every call. The bare API key as a bearer token works but returns a read-only "learner" view without post bodies.
- Field selection uses the header `bloomfire-requested-fields` with a graph syntax, e.g. `id,title,post_body,contents(id,type,text_body,content_url),taxa(name,name_path,taxonomy_name)`. Without it, `post_body`, `taxa`, and attachment details are omitted.
- `GET /posts`, `/series`, `/questions` return the whole collection (paging parameters are ignored on this instance; 715 posts in one 640 KB response).
- `contents[].content_url` is a signed, expiring URL to a PDF rendering of the attachment; `contents[].audio_transcript.transcript` holds video transcripts.
- Rate limit per Bloomfire docs: 500 requests per second for application access.

## Decisions from Matt's Stage 1 review (September 17, 2026)

- Nothing is archived or hidden by default; dated items carry a "Dated <year>" label and are excluded from Start here and Most used.
- The indexer pulls full text of linked Google Docs, Sheets, and Slides (418 distinct files across 282 posts); about 70% export publicly, the rest need a service account with Drive read access.
- The retire-or-refresh list ships as an admin "retirement queue" (Keep / Label as dated / Hide), refilled on each re-index.
- Helpfulness score recomputed monthly and on demand; weights 40/35/25 confirmed.
- Teacher-leader home page invites uploads of the material types, for feedback and as contributed examples.
- Base prompt: the reviewer may judge legal/financial claims when the answer is clearly documented in the Wildflower source material provided (so reviews retrieve relevant Connected passages).
- SSJ stage names. Bloomfire indexer logs in as Matt's account for now. Resend for outbound email (`RESEND_API_KEY`). Foundation-internal posts shown with a label.
- Models: luna for rewrites, explanations, summaries, and chat answers (see `model_compare.json`); sol for reviews.
- Culture is split into two jobs (self-management practices; liberation and equity). All 26 material types ship at launch. Outbound email via SendGrid (`SENDGRID_API_KEY`), not Resend.
