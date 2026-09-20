import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SessionUser } from "@wfw/shared";
import { api } from "./api";
import { Shell } from "./components/Shell";
import { LanguageProvider } from "./language";
import { Loading } from "./components/ui";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminOverview } from "./pages/admin/Overview";
import { AdminTaxonomy } from "./pages/admin/Taxonomy";
import { AdminCuration } from "./pages/admin/Curation";
import { AdminRetirement } from "./pages/admin/Retirement";
import { AdminTypes, AdminTypeEditor } from "./pages/admin/Types";
import { AdminBasePrompt } from "./pages/admin/BasePrompt";
import { AdminSubmissions, AdminSubmissionDetail } from "./pages/admin/Submissions";
import { AdminSettings } from "./pages/admin/Settings";
import { AdminActivity } from "./pages/admin/Activity";
import { AdminFeedback } from "./pages/admin/Feedback";
import { AdminContributions } from "./pages/admin/Contributions";
import { AdminResourceEdit, AdminResourceNew } from "./pages/admin/Resources";
import { AdminQuestions } from "./pages/admin/Questions";
import { Ask } from "./pages/Ask";
import { Home } from "./pages/Home";
import { ConnectedRedirect, ItemPage } from "./pages/Item";
import { Landing } from "./pages/Landing";
import { MapPage, SubjobPage } from "./pages/Map";
import { Materials, MaterialType } from "./pages/Materials";
import { SubmissionPage } from "./pages/Submissions";
import { SharePage } from "./pages/Share";
import { SearchPage } from "./pages/Search";

export default function App() {
  const qc = useQueryClient(); const loc = useLocation();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<{ user: SessionUser | null }>("/api/me") });
  if (me.isLoading) return <div className="wf-page"><Loading what="Signing you in" /></div>;
  const user = me.data?.user ?? null;
  if (!user) return <LanguageProvider user={null}><Routes><Route path="*" element={<Landing next={loc.pathname + loc.search} />} /></Routes></LanguageProvider>;
  return (
    <LanguageProvider user={user}>
    <Routes>
      <Route element={<Shell user={user} onSignOut={() => qc.setQueryData(["me"], { user: null })} />}>
        <Route index element={<Home />} />
        <Route path="map" element={<MapPage />} />
        <Route path="map/:key" element={<SubjobPage />} />
        <Route path="item/:id" element={<ItemPage />} />
        <Route path="c/:kind/:sourceId" element={<ConnectedRedirect />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="ask" element={<Ask />} />
        <Route path="materials" element={<Materials />} />
        <Route path="materials/:key" element={<MaterialType />} />
        <Route path="my" element={<Navigate to="/materials#drafts" replace />} />
        <Route path="share" element={<SharePage />} />
        <Route path="drafts/:id" element={<SubmissionPage />} />
        {user.role === "staff" ? (
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="taxonomy" element={<AdminTaxonomy />} />
            <Route path="curation" element={<AdminCuration />} />
            <Route path="retirement" element={<AdminRetirement />} />
            <Route path="types" element={<AdminTypes />} />
            <Route path="types/:id" element={<AdminTypeEditor />} />
            <Route path="base-prompt" element={<AdminBasePrompt />} />
            <Route path="submissions" element={<AdminSubmissions />} />
            <Route path="submissions/:id" element={<AdminSubmissionDetail />} />
            <Route path="feedback" element={<AdminFeedback />} />
            <Route path="contributions" element={<AdminContributions />} />
            <Route path="resources/new" element={<AdminResourceNew />} />
            <Route path="resources/:id" element={<AdminResourceEdit />} />
            <Route path="questions" element={<AdminQuestions />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="activity" element={<AdminActivity />} />
          </Route>
        ) : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </LanguageProvider>
  );
}
