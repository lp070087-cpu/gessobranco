import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Input = {
  photoPaths: string[];
  bucket?: string;
  serviceName?: string;
  area?: number;
  notes?: string;
  conditions?: string[];
};

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

const analysisResult = z.object({
  difficulty: z.enum(["baixa", "media", "alta"]),
  multiplier: z.number().finite().min(1).max(1.6),
  estimated_hours: z.number().finite().min(0).max(1_000_000),
  detected_issues: z.array(z.string().max(1000)).max(30),
  suggested_materials: z.array(z.string().max(1000)).max(30),
  summary: z.string().max(8000),
});

type AnalysisResult = {
  difficulty: "baixa" | "media" | "alta";
  multiplier: number;
  estimated_hours: number;
  detected_issues: string[];
  suggested_materials: string[];
  summary: string;
};

function fallback(input: Input): AnalysisResult {
  const issues = input.conditions ?? [];
  let mult = 1;
  if (issues.some((c) => /infiltra|umid/i.test(c))) mult += 0.15;
  if (issues.some((c) => /rachadu|trinc/i.test(c))) mult += 0.1;
  if (issues.some((c) => /tort|desalin/i.test(c))) mult += 0.12;
  if (issues.some((c) => /derrub|construir|levantar/i.test(c))) mult += 0.25;
  const diff: AnalysisResult["difficulty"] =
    mult >= 1.3 ? "alta" : mult >= 1.12 ? "media" : "baixa";
  return {
    difficulty: diff,
    multiplier: Number(mult.toFixed(2)),
    estimated_hours: Math.max(2, Math.round((input.area ?? 10) * 0.4 * mult)),
    detected_issues: issues,
    suggested_materials: [
      "Selador acrílico premium",
      "Massa corrida para nivelamento",
      "Tinta látex acetinado",
    ],
    summary:
      "Análise estimada com base nas condições informadas. Recomendamos visita técnica para confirmação.",
  };
}

export const analyzePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => analysisInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const bucket = data.bucket ?? "quote-photos";

    // Never sign another user's private object, even if its path is known.
    if (data.photoPaths.some((path) => !path.startsWith(`${userId}/`))) {
      throw new Error("Acesso negado às fotos solicitadas.");
    }

    // Build signed URLs for AI to fetch
    const urls: string[] = [];
    for (const path of data.photoPaths.slice(0, 4)) {
      const { data: signed, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 10);
      if (error) throw new Error("Não foi possível acessar uma das fotos enviadas.");
      if (signed?.signedUrl) urls.push(signed.signedUrl);
    }

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY || urls.length === 0) {
      return fallback(data);
    }

    const sys = `Você é um especialista em diagnóstico de reformas (pintura, gesso, drywall). 
Analise as fotos enviadas e retorne SOMENTE JSON com este formato exato:
{
  "difficulty": "baixa"|"media"|"alta",
  "multiplier": number entre 1.0 e 1.6,
  "estimated_hours": number,
  "detected_issues": string[],
  "suggested_materials": string[],
  "summary": string em português
}`;

    const userContent: unknown[] = [
      {
        type: "text",
        text: `Serviço: ${data.serviceName ?? "—"} | Área: ${data.area ?? "—"} m² | Observações: ${data.notes ?? "—"} | Condições: ${(data.conditions ?? []).join(", ") || "—"}`,
      },
      ...urls.map((u) => ({ type: "image_url", image_url: { url: u } })),
    ];

    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) {
        console.error("AI gateway error", { status: resp.status });
        return fallback(data);
      }
      const json = await resp.json();
      const text = json?.choices?.[0]?.message?.content ?? "{}";
      const parsed = analysisResult.parse(JSON.parse(text));
      // Sanity defaults
      return {
        difficulty: parsed.difficulty ?? "media",
        multiplier: Number(parsed.multiplier ?? 1),
        estimated_hours: Number(parsed.estimated_hours ?? 4),
        detected_issues: parsed.detected_issues ?? [],
        suggested_materials: parsed.suggested_materials ?? [],
        summary: parsed.summary ?? "",
      };
    } catch {
      console.error("AI analyze failed");
      return fallback(data);
    }
  });
