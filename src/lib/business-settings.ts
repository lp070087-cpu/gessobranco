import { z } from "zod";

export const businessSettingsSchema = z
  .object({
    business_name: z.string().trim().min(1).max(120),
    contact_email: z.union([z.string().email().max(254), z.literal("")]),
    contact_phone: z.string().trim().max(30),
    service_area: z.string().trim().max(300),
    estimate_disclaimer: z.string().trim().max(1500),
    legal_name: z.string().trim().max(160).default(""),
    responsible_name: z.string().trim().max(160).default(""),
    state_registration: z.string().trim().max(30).default(""),
    municipal_registration: z.string().trim().max(30).default(""),
    cnpj: z
      .string()
      .trim()
      .max(22)
      .refine(
        (value) =>
          !value || /^[0-9A-Z]{12}[0-9]{2}$/.test(value.toUpperCase().replace(/[.\-/\s]/g, "")),
        "Confira o CNPJ.",
      )
      .default(""),
    postal_code: z.string().trim().max(12).default(""),
    address: z.string().trim().max(220).default(""),
    address_extra: z.string().trim().max(100).default(""),
    neighborhood: z.string().trim().max(100).default(""),
    city: z.string().trim().max(100).default(""),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => !value || /^[A-Z]{2}$/.test(value))
      .default(""),
    latitude: z.string().trim().max(24).default(""),
    longitude: z.string().trim().max(24).default(""),
  })
  .strict()
  .refine(
    ({ latitude, longitude }) => (!latitude && !longitude) || !!mapCoordinates(latitude, longitude),
    {
      path: ["latitude"],
      message: "Informe latitude e longitude válidas.",
    },
  );

export type BusinessSettings = z.infer<typeof businessSettingsSchema>;
export const defaultBusinessSettings: BusinessSettings = {
  business_name: "Ouro Branco",
  contact_email: "",
  contact_phone: "",
  service_area: "",
  estimate_disclaimer: "",
  legal_name: "",
  responsible_name: "",
  state_registration: "",
  municipal_registration: "",
  cnpj: "",
  postal_code: "",
  address: "",
  address_extra: "",
  neighborhood: "",
  city: "",
  state: "",
  latitude: "",
  longitude: "",
};

export function mapCoordinates(latitude: string, longitude: string) {
  const lat = Number(latitude.replace(",", "."));
  const lon = Number(longitude.replace(",", "."));
  if (
    !latitude.trim() ||
    !longitude.trim() ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 85 ||
    Math.abs(lon) > 180
  )
    return null;
  return { lat, lon };
}

export function businessAddress(settings: BusinessSettings) {
  return [
    settings.address,
    settings.address_extra,
    settings.neighborhood,
    [settings.city, settings.state].filter(Boolean).join(" – "),
    settings.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}
