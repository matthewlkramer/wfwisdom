import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { isResourceRegion } from "@wfw/shared";
import { setReaderLanguage, setReaderRegion } from "../services/language-pref.js";

export const languageSchema = z.object({ language: z.enum(["all", "en", "es"]) });
export const regionSchema = z.object({ region: z.string().refine(isResourceRegion, "Unknown region") });

/** Preferences that follow the reader across devices. */
export const meRouter = Router();
meRouter.use(requireUser);
meRouter.put("/language", async (req, res) => {
  const { language } = languageSchema.parse(req.body);
  await setReaderLanguage(req.user!.id, language);
  res.json({ language });
});
meRouter.put("/region", async (req, res) => {
  const { region } = regionSchema.parse(req.body);
  await setReaderRegion(req.user!.id, region);
  res.json({ region });
});
