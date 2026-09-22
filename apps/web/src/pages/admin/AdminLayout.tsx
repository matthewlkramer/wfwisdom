import { Outlet, useLocation } from "react-router-dom";
const SECTIONS: Record<string, [string, string]> = {
  organize: ["Organize resources", "The shape of the map and what sits where on it: jobs and sub-jobs, and the curation that ranks each resource."],
  queues: ["Resource review queues", "Everything waiting on a decision: shared materials, items flagged as dated, drafts reviewed, and questions offered for review."],
  types: ["Custom material types", "The material types teacher leaders can get feedback on: guides, rubrics, review prompts, and linked resources."],
  "base-prompt": ["Base prompt", "The shared reviewer instructions every material type builds on."],
  feedback: ["App feedback queue", "Notes sent from the Feedback button, with page and screenshot."],
  resources: ["Resources", "Add a Google Doc, Sheet, or Slides file, upload a file, write something short, or build a series."],
  submissions: ["Submission log", "Every draft reviewed, with who sent it, cost, and the verdict."],
  settings: ["Admin settings", "Index health, usage and spend, the kill switch, and the models, limits and scoring weights behind them."],
  activity: ["Activity", "Searches, chat, and the changes foundation partners have made."],
};
export function AdminLayout() {
  const seg = useLocation().pathname.replace(/^\/admin\/?/, "").split("/")[0] ?? "";
  const [title, blurb] = SECTIONS[seg] ?? ["Foundation partner workspace", ""];
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><p className="eyebrow">Foundation partners</p><h1>{title}</h1>{blurb ? <p>{blurb}</p> : null}</div></div>
      <Outlet />
    </div>
  );
}
