import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { isRegionFilterKey } from "@wfw/shared";
import { setReaderLanguage, setReaderRegions } from "../services/language-pref.js";

export const languageSchema = z.object({ language: z.enum(["all", "en", "es"]) });
export const regionSchema = z.object({ regions: z.array(z.string().refine(isRegionFilterKey, "Unknown region")).max(20) });

/** Preferences that follow the reader across devices. */
export const meRouter = Router();
meRouter.use(requireUser);
meRouter.put("/language", async (req, res) => {
  const { language } = languageSchema.parse(req.body);
  await setReaderLanguage(req.user!.id, language);
  res.json({ language });
});
meRouter.put("/regions", async (req, res) => {
  const { regions } = regionSchema.parse(req.body);
  const unique = [...new Set(regions)];
  await setReaderRegions(req.user!.id, unique);
  res.json({ regions: unique });
});
