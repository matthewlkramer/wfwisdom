import { describe, expect, it } from "vitest";
import { buildBodyHtml, extractPrimaryVideo, mediaHtml, nativeMediaHtml, replaceMediaFigures, stripContentTokens } from "./html.js";
import type { BfContent, BfItem } from "./bloomfire.js";

const video = (id: number): BfContent => ({ id, type: "Video", title: "Walkthrough", original_file_name: "walkthrough.mp4", original_file_size: 1024, original_content_type: "video/mp4" } as BfContent);

describe("stripContentTokens", () => {
  it("removes the plain token Connected writes", () => {
    expect(stripContentTokens("Before [content|2595515|] after")).toBe("Before  after");
  });
  it("removes the variants: no trailing pipe, padded digits, and a caption", () => {
    expect(stripContentTokens("a [content|123] b [content| 456 |] c [content|789|caption here] d")).toBe("a  b  c  d");
  });
  it("removes every token, not just the first", () => {
    expect(stripContentTokens("[content|1|][content|2|][content|3|]")).toBe("");
  });
  it("leaves ordinary bracketed text and citation markers alone", () => {
    const s = "See [1] and [content] and [contents|12|] for detail";
    expect(stripContentTokens(s)).toBe(s);
  });
  it("is safe to run twice and on an empty string", () => {
    expect(stripContentTokens(stripContentTokens("x [content|9|] y"))).toBe("x  y");
    expect(stripContentTokens("")).toBe("");
  });
});

describe("buildBodyHtml", () => {
  it("renders a file in place where the embedded content exists", () => {
    const it = { id: 1, post_body: "<p>Watch this: [content|42|]</p>", contents: [video(42)] } as unknown as BfItem;
    const html = buildBodyHtml("post", it);
    expect(html).toContain('data-content-id="42"');
    expect(html).toContain("<video");
    expect(html).not.toContain("[content|");
  });
  it("strips the token when the embedded file is missing or not renderable", () => {
    const it = { id: 1, post_body: "<p>Gone: [content|99|]</p>", contents: [{ id: 99, type: "WebLink", url: "https://example.org" } as BfContent] } as unknown as BfItem;
    const html = buildBodyHtml("post", it);
    expect(html).not.toContain("[content|");
    expect(html).not.toContain("99|");
  });
  it("strips tokens inside a question's answers too", () => {
    const it = { id: 1, explanation: "<p>Q</p>", answers: [{ text: "<p>A [content|7|]</p>" }] } as unknown as BfItem;
    expect(buildBodyHtml("question", it)).not.toContain("[content|");
  });
});

describe("extractPrimaryVideo", () => {
  const attachments = [{ id: 42, name: "walkthrough.mp4", type: "Video", bytes: 1024, mime: "video/mp4" }];
  it("returns the video and removes the figure the body already had for it", () => {
    const html = `<p>Intro</p>${mediaHtml(video(42))}<p>Transcript</p>`;
    const r = extractPrimaryVideo(html, attachments);
    expect(r.video).toEqual({ id: 42, name: "walkthrough.mp4", type: "Video", bytes: 1024, mime: "video/mp4" });
    expect(r.html).not.toContain('data-content-id="42"');
    expect(r.html).toContain("<p>Transcript</p>");
  });
  it("leaves other media figures in the body", () => {
    const html = `${mediaHtml({ id: 7, type: "Image", original_file_name: "a.png" } as BfContent)}${mediaHtml(video(42))}`;
    const r = extractPrimaryVideo(html, attachments);
    expect(r.html).toContain('data-content-id="7"');
    expect(r.html).not.toContain('data-content-id="42"');
  });
  it("returns the video even when the body never embedded it", () => {
    const r = extractPrimaryVideo("<p>Only text</p>", attachments);
    expect(r.video?.id).toBe(42);
    expect(r.html).toBe("<p>Only text</p>");
  });
  it("picks the first video when there are several", () => {
    const r = extractPrimaryVideo("", [{ id: 1, name: "b.mp4", type: "Video", bytes: 0 }, { id: 2, name: "c.mp4", type: "Video", bytes: 0 }]);
    expect(r.video?.id).toBe(1);
  });
  it("does nothing for an item with no video", () => {
    const html = "<p>Text</p>";
    expect(extractPrimaryVideo(html, [{ id: 3, name: "a.pdf", type: "Document", bytes: 10 }])).toEqual({ html, video: null });
  });
});

describe("import helpers", () => {
  it("nativeMediaHtml renders a Drive file like a Connected attachment", () => {
    const html = nativeMediaHtml({ driveId: "abc123", name: "plan.pdf", mime: "application/pdf", bytes: 2 * 1024 * 1024, kind: "document" });
    expect(html).toContain('data-drive-id="abc123"');
    expect(html).toContain('<iframe src="/api/files/native/abc123"');
    expect(html).toContain("2.0 MB");
  });
  it("replaceMediaFigures swaps each Connected figure by content id", () => {
    const html = `<p>Hi</p>${mediaHtml(video(42))}${mediaHtml({ id: 7, type: "Image", original_file_name: "a.png" } as BfContent)}<p>Bye</p>`;
    const out = replaceMediaFigures(html, (id) => (id === 42 ? "<p>VIDEO</p>" : ""));
    expect(out).toBe("<p>Hi</p><p>VIDEO</p><p>Bye</p>");
  });
});
