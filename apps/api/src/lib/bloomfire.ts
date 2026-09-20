import { env } from "../env.js";

const PERSON = "id,first_name,last_name";
const CONTENT = "contents(id,type,media_type,publish_state,title,description,original_file_name,text_body,content_url,original_content_type,original_file_size,has_audio_transcript,audio_transcript(id,transcript,job_status),url,updated_at)";
const COMMON = `author(${PERSON}),categories(id,name),keywords(id,name),series(id,title),likes_count,views_count,popularity,followers_count,comments_count,published_at,updated_at,created_at,public,published,post_body,url,taxa(name,id,name_path,taxonomy_name)`;
export const POST_FIELDS = `id,title,description,contribution_type,featured,${COMMON},${CONTENT},contents_count`;
export const SERIES_FIELDS = `id,title,description,${COMMON},posts(id,title),posts_count`;
export const QUESTION_FIELDS = `id,name,question,description,explanation,${COMMON},answers(id,text,body,created_at,likes_count,author(${PERSON})),answers_count,accepted(id)`;

export interface BfPerson { id: number; first_name?: string; last_name?: string }
export interface BfContent { id: number; type: string; media_type?: string | null; title?: string | null; description?: string | null; original_file_name?: string | null; text_body?: string | null; content_url?: string | null; original_content_type?: string | null; original_file_size?: number | null; has_audio_transcript?: boolean; audio_transcript?: { transcript?: string | null } | null; url?: string | null; updated_at?: string }
export interface BfItem {
  id: number; title?: string; name?: string; question?: string; description?: string | null; explanation?: string | null; post_body?: string | null; url?: string;
  author?: BfPerson | null; categories?: { id: string; name: string }[]; series?: { id: number; title: string }[]; posts?: { id: number; title: string }[];
  likes_count?: number; views_count?: number; comments_count?: number; published_at?: string | null; updated_at?: string; public?: boolean; published?: boolean;
  taxa?: { name: string; id: string; name_path: string[]; taxonomy_name: string }[]; contents?: BfContent[]; answers?: { text?: string | null; body?: string | null; author?: BfPerson | null }[];
}

export class Bloomfire {
  private token: string | null = null;
  constructor(private base = env.bloomfireBase) {}

  async login(): Promise<void> {
    if (!env.bloomfireKey || !env.bloomfireEmail) throw new Error("BLOOMFIRE_API_KEY and BLOOMFIRE_LOGIN_EMAIL must be set");
    const r = await fetch(`${this.base}/api/v2/login`, { method: "POST", headers: { "content-type": "application/json", "bloomfire-requested-fields": "session_token" }, body: JSON.stringify({ email: env.bloomfireEmail, api_key: env.bloomfireKey }) });
    if (!r.ok) throw new Error(`Bloomfire login failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const d = await r.json() as { session_token?: string };
    if (!d.session_token) throw new Error("Bloomfire login returned no session token");
    this.token = d.session_token;
  }
  private async get<T>(path: string, fields?: string, tries = 3): Promise<T> {
    if (!this.token) await this.login();
    let last: unknown;
    for (let i = 0; i < tries; i++) {
      try {
        const headers: Record<string, string> = { Authorization: `Bloomfire-Session-Token ${this.token}`, Accept: "application/json" };
        if (fields) headers["bloomfire-requested-fields"] = fields;
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 120_000);
        const r = await fetch(`${this.base}/api/v2${path}`, { headers, signal: ctrl.signal }).finally(() => clearTimeout(t));
        if (r.status === 401) { await this.login(); throw new Error("re-auth"); }
        if (!r.ok) throw new Error(`Bloomfire ${path}: ${r.status}`);
        return await r.json() as T;
      } catch (e) { last = e; await new Promise((r) => setTimeout(r, 2500 * (i + 1))); }
    }
    throw last instanceof Error ? last : new Error(String(last));
  }
  // Only ids and timestamps are requested: rendering the full collection sometimes times out on Connected's side.
  listPosts() { return this.get<{ id: number; updated_at: string }[]>("/posts", "id,updated_at", 6); }
  listSeries() { return this.get<{ id: number; updated_at: string }[]>("/series", "id,updated_at", 6); }
  listQuestions() { return this.get<{ id: number; updated_at: string }[]>("/questions", "id,updated_at", 6); }
  post(id: number) { return this.get<BfItem>(`/posts/${id}`, POST_FIELDS); }
  series(id: number) { return this.get<BfItem>(`/series/${id}`, SERIES_FIELDS); }
  question(id: number) { return this.get<BfItem>(`/questions/${id}`, QUESTION_FIELDS); }
  /** Opens an attachment for streaming: waits for the headers only, the caller consumes the body. */
  async open(url: string, timeoutMs = 60_000): Promise<Response> {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try { const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" }); if (!r.ok || !r.body) throw new Error(`download ${r.status}`); return r; }
    catch (e) { throw new Error((e as Error).name === "AbortError" ? `download did not start within ${timeoutMs / 1000}s` : (e as Error).message); }
    finally { clearTimeout(t); }
  }
  /** Downloads an attachment; a stalled transfer is abandoned after the timeout rather than hanging a worker. */
  async download(url: string, timeoutMs = 90_000): Promise<Buffer> {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctrl.signal }); if (!r.ok) throw new Error(`download ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { throw new Error((e as Error).name === "AbortError" ? `download timed out after ${timeoutMs / 1000}s` : (e as Error).message); }
    finally { clearTimeout(t); }
  }
}
