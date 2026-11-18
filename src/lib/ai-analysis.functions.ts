import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { preliminaryAnalysis } from "./preliminary-analysis";
import { z } from "zod";

const analysisInput = z
  .object({
    photoPaths: z
      .array(
        z
          .string()
          .min(1)
          .max(512)
          .refine(
            (path) => !path.includes("..") && !path.includes("\\") && !path.startsWith("/"),
            "Invalid photo path",
          ),
      )
      .max(4),
    bucket: z.enum(["quote-photos", "appointment-media"]).optional(),
    serviceName: z.string().trim().max(160).optional(),
    area: z.number().finite().positive().max(1_000_000).optional(),
    notes: z.string().trim().max(4000).optional(),
    conditions: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  })
  .strict();

export const analyzePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => analysisInput.parse(data))
  .handler(async ({ data, context }) => {
    if (data.photoPaths.some((path) => !path.startsWith(`${context.userId}/`))) {
      throw new Error("Acesso negado às fotos solicitadas.");
    }
    return preliminaryAnalysis(data);
  });
