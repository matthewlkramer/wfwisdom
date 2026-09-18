import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { setReaderLanguage } from "../services/language-pref.js";

export const languageSchema = z.object({ language: z.enum(["all", "en", "es"]) });

/** Preferences that follow the reader across devices. */
export const meRouter = Router();
meRouter.use(requireUser);
meRouter.put("/language", async (req, res) => {
  const { language } = languageSchema.parse(req.body);
  await setReaderLanguage(req.user!.id, language);
  res.json({ language });
});
