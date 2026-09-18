import { env } from "../env.js";

const PRICE: Record<string, [number, number]> = { "gpt-5.6-sol": [4, 20], "gpt-5.6-terra": [2, 12], "gpt-5.6-luna": [0.2, 1.2], "text-embedding-3-small": [0.02, 0], "text-embedding-3-large": [0.13, 0] };
export function costUsd(model: string, usage: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; total_tokens?: number } | undefined): number {
  const p = PRICE[model] ?? [0, 0];
  const inp = usage?.input_tokens ?? usage?.prompt_tokens ?? 0, out = usage?.output_tokens ?? 0;
  return (inp * (p[0] ?? 0) + out * (p[1] ?? 0)) / 1e6;
}
export class OpenAIError extends Error { constructor(msg: string, public status: number) { super(msg); } }

async function call(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  if (!env.openaiKey) throw new OpenAIError("OPENAI_API_KEY is not set", 500);
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://api.openai.com/v1${path}`, { method: "POST", headers: { Authorization: `Bearer ${env.openaiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await r.text();
    if (!r.ok) throw new OpenAIError(`OpenAI ${path} failed: ${r.status} ${text.slice(0, 300)}`, r.status);
    return JSON.parse(text);
  } finally { clearTimeout(t); }
}

export interface Usage { input_tokens: number; output_tokens: number; total_tokens: number; }
export interface ResponseResult { text: string; usage: Usage; model: string; cost: number; }

export async function respond(opts: { model: string; system: string; user: string; effort?: "low" | "medium" | "high"; maxOutput?: number; schema?: { name: string; schema: unknown }; timeoutMs?: number }): Promise<ResponseResult> {
  const body: Record<string, unknown> = {
    model: opts.model, reasoning: { effort: opts.effort ?? "low" }, max_output_tokens: opts.maxOutput ?? 1500,
    input: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
  };
  if (opts.schema) body.text = { format: { type: "json_schema", name: opts.schema.name, strict: true, schema: opts.schema.schema } };
  const d = await call("/responses", body, opts.timeoutMs ?? 120_000) as { output?: { type: string; content?: { type: string; text?: string }[] }[]; usage?: Usage; status?: string; incomplete_details?: { reason?: string } };
  const text = (d.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
  if (!text && d.status === "incomplete") throw new OpenAIError(`Model response incomplete: ${d.incomplete_details?.reason ?? "unknown"}`, 502);
  const usage = d.usage ?? { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  return { text, usage, model: opts.model, cost: costUsd(opts.model, usage) };
}

export async function respondJson<T>(opts: Parameters<typeof respond>[0] & { schema: { name: string; schema: unknown } }): Promise<{ data: T } & ResponseResult> {
  const r = await respond(opts);
  try { return { data: JSON.parse(r.text) as T, ...r }; }
  catch { throw new OpenAIError("Model returned invalid JSON", 502); }
}

export async function embed(texts: string[], model: string): Promise<{ vectors: number[][]; usage: { prompt_tokens: number; total_tokens: number }; cost: number }> {
  if (texts.length === 0) return { vectors: [], usage: { prompt_tokens: 0, total_tokens: 0 }, cost: 0 };
  const d = await call("/embeddings", { model, input: texts.map((t) => t.slice(0, 24_000)) }, 120_000) as { data: { index: number; embedding: number[] }[]; usage: { prompt_tokens: number; total_tokens: number } };
  const vectors: number[][] = new Array(texts.length);
  for (const e of d.data) vectors[e.index] = e.embedding;
  return { vectors, usage: d.usage, cost: costUsd(model, d.usage) };
}
