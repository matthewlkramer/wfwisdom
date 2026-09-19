# Wildflower Wisdom: admin guide

For Wildflower Foundation staff. Everything staff might want to change lives in the database and is edited in the app under **Staff** (visible to accounts on the wildflowerschools.org Google Workspace). Nothing below requires a code change.

## What the site is

- **Start here**: a teacher leader picks their stage (Discovery, Visioning, Planning, Startup, Open) and sees the resources staff pinned or marked Essential for that stage, plus what the network is opening most.
- **Feedback queue** (Staff, Feedback queue): notes sent from the Feedback button in the header. Each carries the page, a screenshot of the viewport, the browser, and the reporter. Set a status (open, in progress, resolved, dismissed) and keep staff notes; status changes are written to the activity log.
- **Map**: Connected organized by job (form your nonprofit, build your board, find a space, and so on) and sub-job. Two clicks to any resource. Item pages show the full post, its files (streamed from Connected while it exists), and embedded Google files, with a link to the original in Connected.
- **Search** and **Ask**: semantic search over everything indexed (including attachment and linked Google Doc text), with a one-line "why this matches", and a chat that answers only from Connected and cites the items it used. Ask also shows approved example questions, and the reader's own earlier questions with the answers they got.
- **Questions queue** (Staff, Questions): the questions teacher leaders offered for staff review or offered to share publicly. See below.
- **Language filter**: every page that lists resources carries an English / Spanish / All resources control. See below.
- **Get feedback**: 26 material types (landlord letter, family handbook, budget, job posting, and more). Each has a "what good looks like" guide, linked Connected resources, and a review prompt. A teacher leader pastes or uploads a draft and gets a verdict, rubric scores, and specific feedback from the AI reviewer, which they can email to themselves or download.

## How to read the Questions queue

At the bottom of the Ask page a teacher leader can tick two boxes, both off by default:

1. **"Let Wildflower Foundation staff review this question and answer to improve the tool."** The question lands in **Staff → Questions**.
2. **"Share this question on this page as an example of what people are asking."** They then choose **Share anonymously** (the default) or **Share with my name**. The question lands in the same queue marked *waiting on approval*.

**Staff → Questions** lists both kinds, newest first, with the asker, the answer that was given and its citations. Filter by **Unreviewed / Reviewed** and by share state. On each question you can:

- **Add a note** — what the team learned, what to fix. Every note records who wrote it and when, and notes are kept, not overwritten.
- **Mark reviewed** (or put it back in the queue). The queue defaults to Unreviewed, so it works as a worklist.
- **Approve** or **Reject sharing** for a question the asker offered as an example. **Nothing is shown publicly until it is approved**, and only a question the asker actually offered can be approved. Approved questions appear under "What others are asking" on Ask, with the asker's name only if they chose that — otherwise "Anonymous". Rejecting an already-approved question takes it back off the page immediately.

Every staff action here (note, review, approve, reject) is written to **Staff → Activity**.

Teacher leaders see their own questions at the bottom of Ask whether or not they ticked anything. Each row opens to show the answer and its citations, and has a **Use this question** button that drops the question back into the ask box to edit and re-ask.

## The English / Spanish language filter

Every page that lists resources — Start here, Map (and sub-job pages), Search, and the resource lists on a material type — carries an **English / Spanish / All resources** control. The default is **All resources**.

- The choice is remembered per person: it is stored on their user record, so it follows them to another computer. Signed-out browsers fall back to local storage.
- Changing it anywhere applies it everywhere, until they change it again.
- Each item's language is decided during indexing by the assist model, which reads the opening 200 words of the item's title and body along with its categories. It is told to judge the writing rather than the names in it, so an English staffing roster or release form carrying Spanish surnames is not filed as Spanish, and to treat an "Español"/"Spanish" label in the title or category as Spanish.
- Each check costs about $0.00005, so re-checking the whole library is about five cents. It honours the kill switch.
- If the check cannot run — kill switch on, the model unreachable, a nonsense answer — it is retried once, and if it still fails the item keeps whatever language it already had. A failed check never overwrites a good answer. The failure names the item in the run log, and the backfill prints the ids at the end with the command to retry just those, so a stale verdict is never left silently in place.
- Items the model cannot place are marked **unknown** and appear only under **All resources**. Nothing is ever lost — switching back to All shows everything.
- A material type whose linked resources are all in the other language shows a note saying so rather than an empty list.

To re-check everything, run `pnpm backfill:language --all` (see below).

## How to re-index Connected

The indexer logs in to Connected with the Bloomfire API key and the login email in the secrets, pulls every post, series, and question, downloads attachments and extracts their text, fetches the text of linked Google Docs, Sheets, and Slides, embeds what changed, writes two-sentence summaries, and recomputes helpfulness scores.

- It runs automatically every night at 03:10 UTC.
- To run it now: **Staff → Overview → Re-index now**. "Full re-index" re-fetches every item even if Connected says it has not changed (use after changing the embedding model or if something looks stale). Progress and the log show on the same page.
- Items that disappear from Connected are marked removed and drop out of every view. Unpublished or group-restricted items are never indexed.
- Each item's language (English, Spanish, or unknown) is decided only for the items Connected reports as changed. An item whose `updated_at` is unchanged is not re-read at all, so the nightly re-index costs a fraction of a cent. A **full** re-index re-checks all of them, about four cents. Existing items are filled in by the one-off `pnpm backfill:language`, so no re-index is needed just for language.
- Google files shared as "anyone with the link" are read without credentials. Private ones are read through the service account (`GOOGLE_SERVICE_ACCOUNT_JSON`), acting as `GOOGLE_IMPERSONATE_EMAIL` when domain-wide delegation is authorized, otherwise as itself (which reaches shared drives it is a member of). Re-index after changing either.

## How to curate the best resources

**Staff → Curation** lists every item with its score, views, and placements. Per item you can:

- Mark **Essential** or **Staff pick**. Both show a badge everywhere the item appears and rank above unmarked items.
- **Pin to a stage** with a position. Pinned items lead the Start here list for that stage, in your order.
- **Hide** an item from teacher-leader views (staff still see it).
- Add a **Dated** label (for example "Dated 2021"). The item stays searchable but leaves Start here and Most used.
- Change **placements**: which sub-jobs it appears in and which is primary. Items can live in several places.

Overrides outrank the computed score and survive re-indexing. The score itself is 40% curation, 35% usage (Connected views per month blended with wfwisdom clicks and helpful votes as they accumulate), 25% freshness (with templates, policies, and definitions decaying at half speed). Weights and the freshness ladder are in **Settings**. Scores recompute monthly, after every re-index, and on demand from Overview.

**Staff → Retirement queue** holds items the classifier flagged as dated after each re-index. Nothing is hidden until a person decides: Keep, Label as dated, or Hide. Every decision records who made it.

**Staff → Taxonomy** renames, reorders, moves, adds, and merges jobs and sub-jobs. A job can be marked "Foundation staff" (shown last and labeled) or hidden from teacher leaders. Sub-jobs carry the stages they light up in.

## How to add a material type

**Staff → Material types → Add a material type**. Give it a key (lowercase), a name, the job it belongs to, the "what good looks like" guide in Markdown (purpose, audience, must-have elements, common mistakes, tone, Wildflower-specific considerations), and a rubric of up to eight criteria with what a 5 looks like. Then open it to add reviewer notes and link Connected resources (searched from the index). Deactivate a type to hide it without deleting its history.

## How to tune a prompt

Every review is built from three editable parts:

1. **Base prompt** (Staff → Base prompt): the Wildflower voice, values, and the rules the reviewer follows for every type. Saving creates a new version; every review records which version it used.
2. **The type's guide, rubric, and reviewer notes** (Staff → Material types → the type). Saving content changes creates a new version. Version history shows every version, who saved it and why, and can restore any of them.
3. **Linked resources** for the type, which the reviewer may recommend and nothing else.

At run time the app also retrieves the Connected passages most relevant to the draft so the reviewer can check claims against Wildflower source material.

Use **Test the prompt** on the type page to run a sample draft through the full review, including unsaved edits, and see verdict, scores, feedback, time, and cost. Test runs appear in the submission log marked "test" and do not count against user limits.

Model and reasoning effort are set globally in Settings and can be overridden per type.

## How to read the submission log

**Staff → Submission log** shows every draft with the submitter's name and email, the type and version, the verdict, and cost. Open one to see the full feedback beside the draft as submitted. Drafts a writer marked "contributed" are ones they offered as examples for other teams. Use the log to follow up with teams and to spot where a guide or rubric needs tuning. **Staff → Activity** shows recent searches, questions (including the ones Connected did not cover, which point to gaps), staff changes, and users.

## Cost controls

Settings holds the per-account and global daily review limits, the chat limits, the upload size and draft length caps, and the review output cap. The **kill switch** on Overview pauses all AI features at once. Worst-case daily spend at the default limits is about $36 (120 reviews at the caps); typical use is a small fraction. Overview shows today's usage and spend.

## Secrets and how to rotate keys

Set in the Replit app's Secrets (not in code):

| Secret | Purpose | To rotate |
| --- | --- | --- |
| `OPENAI_API_KEY` | Reviews, search, chat, embeddings | Create a new key at platform.openai.com, paste it, restart the app, then delete the old key. |
| `BLOOMFIRE_API_KEY` and `BLOOMFIRE_LOGIN_EMAIL` | Indexer login to Connected | Bloomfire Settings → Integrations (Owner role) regenerates the key. The email is any Bloomfire account the indexer logs in as; a dedicated account is better than a person's. |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | Google sign-in | Google Cloud Console → Credentials → the OAuth client. Add a new secret, paste it, restart, then remove the old one. Redirect URIs must include `https://wfwisdom.replit.app/api/auth/google/callback` and the development URL. |
| `RESEND_API_KEY` | "Email me this feedback" | Resend dashboard → API keys. `MAIL_FROM` sets the sender (a verified wildflowerschools.org address). |
| `SESSION_SECRET` | Signs session cookies | Any 64 random characters. Rotating it signs everyone out. |
| `DATABASE_URL` | Replit Postgres | Managed by Replit. |
| `APP_BASE_URL` | The public URL, used for OAuth redirects and email links | `https://wfwisdom.replit.app` in production. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Read private Google files; read and write the Wisdom shared drive | Google Cloud console: IAM & Admin, Service Accounts, Keys, Add key (JSON). Paste the whole file. To rotate: add a new key, replace the secret, delete the old key. |
| `GOOGLE_IMPERSONATE_EMAIL` | Domain user the service account acts as (domain-wide delegation) | A real licensed user, not an alias. Authorize the service account's client ID for scope `https://www.googleapis.com/auth/drive` in Google Admin, Security, API controls, Domain-wide delegation. |
| `GOOGLE_SHARED_DRIVE_ID` | The "Wildflower Wisdom" shared drive | The id after `/folders/` in the shared drive's URL. Add the service account's email and the impersonated user as Managers. |

Run `node scripts/check-secrets.mjs` in the Repl shell to verify every secret against its service without printing values.

## One-off maintenance commands

| Command | What it does |
| --- | --- |
| `pnpm backfill:language` | Decides the language of every already-indexed item still marked unknown, using the same model check the indexer runs. Safe to re-run; it never touches Connected and never re-indexes. |
| `pnpm backfill:language --all` | Re-checks every item, including ones already marked English or Spanish. About five cents and a minute or two for the whole library. |
| `pnpm backfill:language --all --dry-run` | Reports how many items would be checked and what it would cost, without writing anything or spending anything. Run this first if you want the cost up front. |
| `pnpm backfill:language --ids=a,b,c` | Re-checks just those item ids, whatever they are currently marked. The command to run is printed for you whenever a run leaves items unchecked. |

## Deploying changes

GitHub `main` is the source of truth. Replit pulls from it; the post-merge hook installs dependencies, runs migrations and the idempotent seed, and builds. Publishing to wfwisdom.replit.app is done from Replit (Deploy). Before merging to main, run `pnpm typecheck`, `pnpm test`, and `pnpm build`.

After deploying the Questions and language release, run `pnpm backfill:language` once in the Repl shell. The migration itself already marks items whose title or category says "Español"/"Spanish"; the backfill catches the rest. Until it runs, items read as *unknown* and show only under **All resources**.
