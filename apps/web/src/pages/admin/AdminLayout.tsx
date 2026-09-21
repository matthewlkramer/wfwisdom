import { Outlet, useLocation } from "react-router-dom";
const SECTIONS: Record<string, [string, string]> = {
  "": ["Overview", "Index health, usage, spend, and the kill switch."],
  taxonomy: ["Taxonomy", "Jobs and sub-jobs on the map, and the stages each belongs to. Move resources between sub-jobs by dragging them onto the tree."],
  curation: ["Curation", "Essential, Recommended, pins, hides, and Dated labels. Overrides outrank the computed score."],
  retirement: ["Retirement queue", "Items the audit flagged as dated, thin, or superseded. Keep, label, or hide each one."],
  types: ["Material types", "The material types teacher leaders can get feedback on: guides, rubrics, review prompts, and linked resources."],
  "base-prompt": ["Base prompt", "The shared reviewer instructions every material type builds on."],
  submissions: ["Submission log", "Every draft reviewed, with who sent it, cost, and the verdict."],
  feedback: ["Feedback queue", "Notes sent from the Feedback button, with page and screenshot."],
  contributions: ["Contributions", "Materials teacher leaders shared. Publish them on the map or decline with a note."],
  resources: ["Resources", "Add a Google Doc, Sheet, or Slides file, upload a file, write something short, or build a series."],
  questions: ["Questions", "Questions asked on Ask whose asker offered them for staff review or as a public example."],
  settings: ["Settings", "Models, limits, scoring weights, and the staff domain."],
  activity: ["Activity", "Searches, chat, and staff changes."],
};
export function AdminLayout() {
  const seg = useLocation().pathname.replace(/^\/admin\/?/, "").split("/")[0] ?? "";
  const [title, blurb] = SECTIONS[seg] ?? ["Staff workspace", ""];
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><p className="eyebrow">Staff workspace</p><h1>{title}</h1>{blurb ? <p>{blurb}</p> : null}</div></div>
      <Outlet />
    </div>
  );
}
