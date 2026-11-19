import { z } from "zod";

export const businessSettingsSchema = z
  .object({
    business_name: z.string().trim().min(1).max(120),
    contact_email: z.union([z.string().email().max(254), z.literal("")]),
    contact_phone: z.string().trim().max(30),
    service_area: z.string().trim().max(300),
    estimate_disclaimer: z.string().trim().max(1500),
  })
  .strict();

export type BusinessSettings = z.infer<typeof businessSettingsSchema>;
export const defaultBusinessSettings: BusinessSettings = {
  business_name: "Ouro Branco",
  contact_email: "",
  contact_phone: "",
  service_area: "",
  estimate_disclaimer: "",
};
