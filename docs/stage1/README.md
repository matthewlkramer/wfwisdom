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
