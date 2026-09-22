import { describe, expect, it } from "vitest";
import { buildBodyHtml, dropDuplicateByline, extractPrimaryVideo, isOpaqueFileName, mediaHtml, mergeAdjacentLists, nativeMediaHtml, promoteGoogleEmphasis, replaceMediaFigures, stripContentTokens } from "./html.js";
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

describe("mergeAdjacentLists", () => {
  it("joins the single-item lists Connected writes, so the numbering runs 1-2-3", () => {
    const html = "<ol><li>Loans</li></ol><br /><ol><li>Grants</li></ol><br /><ol><li>Teacher Led Fundraising</li></ol>";
    expect(mergeAdjacentLists(html)).toBe("<ol><li>Loans</li><li>Grants</li><li>Teacher Led Fundraising</li></ol>");
  });
  it("drops the start attribute with the boundary, because the count is continuous again", () => {
    expect(mergeAdjacentLists('<ol><li>a</li></ol> <ol start="1"><li>b</li></ol>')).toBe("<ol><li>a</li><li>b</li></ol>");
  });
  it("joins across whitespace and empty paragraphs as well as <br>", () => {
    expect(mergeAdjacentLists("<ul><li>a</li></ul>\n  <ul><li>b</li></ul>")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(mergeAdjacentLists("<ol><li>a</li></ol><p><br /></p><ol><li>b</li></ol>")).toBe("<ol><li>a</li><li>b</li></ol>");
  });
  it("leaves two lists separated by real prose as two lists", () => {
    const html = "<ol><li>a</li></ol><p>Then, separately:</p><ol><li>b</li></ol>";
    expect(mergeAdjacentLists(html)).toBe(html);
  });
  it("never merges a list into one of the other kind", () => {
    const html = "<ol><li>a</li></ol><br /><ul><li>b</li></ul>";
    expect(mergeAdjacentLists(html)).toBe(html);
  });
  it("leaves a nested list alone", () => {
    const html = "<ol><li>a<ol><li>a1</li></ol></li><li>b</li></ol>";
    expect(mergeAdjacentLists(html)).toBe(html);
  });
  it("is safe to run twice and on an empty string", () => {
    const once = mergeAdjacentLists("<ol><li>a</li></ol><br /><ol><li>b</li></ol>");
    expect(mergeAdjacentLists(once)).toBe(once);
    expect(mergeAdjacentLists("")).toBe("");
  });
  it("runs as part of building a body, so newly indexed items are stored joined", () => {
    const it = { id: 1, post_body: "<ol><li>One</li></ol><br /><ol><li>Two</li></ol>" } as unknown as BfItem;
    expect(buildBodyHtml("post", it)).toContain("<li>One</li><li>Two</li>");
  });
});

describe("isOpaqueFileName", () => {
  it("spots the machine tokens Connected stores some images under", () => {
    expect(isOpaqueFileName("AGV_vUeS_RLQ0JOYa7F4QUVrw5UCJyYz2MZPzklPRvVsNdhnzXy-_11QFp_gpFGYoH19XJR__s2048")).toBe(true);
  });
  it("leaves a name a person would recognise alone", () => {
    expect(isOpaqueFileName("floor-plan.png")).toBe(false);
    expect(isOpaqueFileName("Board resolution to open a bank account.docx")).toBe(false);
    expect(isOpaqueFileName("budget")).toBe(false);
    expect(isOpaqueFileName("A long descriptive title with spaces but no extension")).toBe(false);
  });
});

describe("media captions", () => {
  it("drops an opaque name from the caption and the alt text", () => {
    const long = "AGV_vUeS_RLQ0JOYa7F4QUVrw5UCJyYz2MZPzklPRvVsNdhnzXy-_11QFp_gpFGYoH19XJR__s2048";
    const html = mediaHtml({ id: 1, type: "Image", original_file_name: long, original_file_size: 1024 } as BfContent);
    expect(html).not.toContain(long);
    expect(html).toContain('alt=""');
    expect(html).toContain("Download");
  });
  it("keeps a real name", () => {
    const html = mediaHtml({ id: 1, type: "Image", original_file_name: "floor-plan.png" } as BfContent);
    expect(html).toContain("<strong>floor-plan.png</strong>");
    expect(html).toContain('alt="floor-plan.png"');
  });
  it("does the same for a file that lives in Drive", () => {
    const long = "AGV_vUeS_RLQ0JOYa7F4QUVrw5UCJyYz2MZPzklPRvVsNdhnzXy-_11QFp_gpFGYoH19XJR__s2048";
    expect(nativeMediaHtml({ driveId: "d1", name: long, mime: "image/png", bytes: 10, kind: "image" })).not.toContain(long);
    expect(nativeMediaHtml({ driveId: "d1", name: "plan.pdf", mime: "application/pdf", bytes: 10, kind: "document" })).toContain("<strong>plan.pdf</strong>");
  });
});

describe("promoteGoogleEmphasis", () => {
  const doc = (style: string, body: string) => `<html><head><style>${style}</style></head><body>${body}</body></html>`;
  it("turns a class the stylesheet makes bold into real bold", () => {
    const out = promoteGoogleEmphasis(doc(".c3{font-weight:700}", '<p><span class="c3">HERE IS BOLD</span></p>'));
    expect(out).toBe("<p><strong>HERE IS BOLD</strong></p>");
  });
  it("handles italic and underline, and a class that means several at once", () => {
    expect(promoteGoogleEmphasis(doc(".a{font-style:italic}", '<p><span class="a">x</span></p>'))).toBe("<p><em>x</em></p>");
    expect(promoteGoogleEmphasis(doc(".a{text-decoration:underline}", '<p><span class="a">x</span></p>'))).toBe("<p><u>x</u></p>");
    expect(promoteGoogleEmphasis(doc(".a{font-weight:bold;font-style:italic}", '<p><span class="a">x</span></p>'))).toBe("<p><strong><em>x</em></strong></p>");
  });
  it("reads emphasis off an inline style too", () => {
    expect(promoteGoogleEmphasis(doc("", '<p><span style="font-weight:700">x</span></p>'))).toBe("<p><strong>x</strong></p>");
  });
  it("leaves an unstyled span exactly as it was, including a nested one", () => {
    const body = '<p><span class="c1">plain <span class="c2">also plain</span></span></p>';
    expect(promoteGoogleEmphasis(doc(".c9{font-weight:700}", body))).toBe(body);
  });
  it("closes the right tag when a bold span wraps a plain one", () => {
    const out = promoteGoogleEmphasis(doc(".b{font-weight:700}", '<p><span class="b">bold <span class="p">still bold</span></span> after</p>'));
    expect(out).toBe('<p><strong>bold <span class="p">still bold</span></strong> after</p>');
  });
  it("ignores a weight that is not bold", () => {
    expect(promoteGoogleEmphasis(doc(".n{font-weight:400}", '<p><span class="n">x</span></p>'))).toBe('<p><span class="n">x</span></p>');
  });
  it("returns just the body when there is nothing to promote", () => {
    expect(promoteGoogleEmphasis("<html><head></head><body><p>hi</p></body></html>")).toBe("<p>hi</p>");
  });
});

describe("dropDuplicateByline", () => {
  it("removes an opening byline that repeats the author shown", () => {
    expect(dropDuplicateByline("<p><span>By Sep Kamvar</span></p><p>Body.</p>", "Sep Kamvar")).toBe("<p>Body.</p>");
  });
  it("keeps the wrapping divs the body came in", () => {
    expect(dropDuplicateByline("<div><div><p>By Sep Kamvar</p><p>Body.</p></div></div>", "Sep Kamvar"))
      .toBe("<div><div><p>Body.</p></div></div>");
  });
  it("handles the Spanish translations and a named co-author", () => {
    expect(dropDuplicateByline("<p><strong>Por Sep Kamvar</strong></p><p>Cuerpo.</p>", "Sep Kamvar")).toBe("<p>Cuerpo.</p>");
    expect(dropDuplicateByline("<p>By Sep Kamvar (and Matt Kramer)</p><p>Body.</p>", "Sep Kamvar and Matt Kramer")).toBe("<p>Body.</p>");
  });
  it("leaves a byline naming someone else alone", () => {
    const html = "<p>By Matt Kramer</p><p>Body.</p>";
    expect(dropDuplicateByline(html, "Sep Kamvar")).toBe(html);
  });
  it("only looks at the opening paragraph, and only when it is nothing else", () => {
    const later = "<p>Body.</p><p>By Sep Kamvar</p>";
    expect(dropDuplicateByline(later, "Sep Kamvar")).toBe(later);
    const prose = "<p>By Sep Kamvar, written in 2014, this essay argues that…</p><p>Body.</p>";
    expect(dropDuplicateByline(prose, "Sep Kamvar")).toBe(prose);
  });
  it("does nothing without an author", () => {
    const html = "<p>By Sep Kamvar</p><p>Body.</p>";
    expect(dropDuplicateByline(html, null)).toBe(html);
  });
});
