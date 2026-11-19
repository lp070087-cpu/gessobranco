import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { commercialFetch } from "@/lib/commercial-client";
import { mapCoordinates } from "@/lib/business-settings";

export function MapPreview({ latitude, longitude }: { latitude: string; longitude: string }) {
  const point = mapCoordinates(latitude, longitude);
  if (!point) return null;
  const { lat, lon } = point;
  const bbox = [
    Math.max(-180, lon - 0.008),
    Math.max(-85, lat - 0.005),
    Math.min(180, lon + 0.008),
    Math.min(85, lat + 0.005),
  ].join(",");
  const map = new URLSearchParams({ bbox, layer: "mapnik", marker: lat + "," + lon });
  return (
    <div className="ouro-map">
      <iframe
        title="Mapa da localização da Ouro Branco"
        loading="lazy"
        src={"https://www.openstreetmap.org/export/embed.html?" + map}
      />
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`}
        target="_blank"
        rel="noreferrer"
      >
        Abrir mapa completo
      </a>
    </div>
  );
}

export function BusinessMap() {
  const [location, setLocation] = useState<{
    address: string;
    latitude: string;
    longitude: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<typeof location>("business/location", undefined, controller.signal)
      .then(setLocation)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!location?.address && !location?.latitude) return null;
  return (
    <section className="ouro-location" aria-label="Localização">
      <div>
        <MapPin aria-hidden="true" size={22} />
        <h2>Onde estamos</h2>
      </div>
      {location.address && <address>{location.address}</address>}
      <MapPreview latitude={location.latitude} longitude={location.longitude} />
    </section>
  );
}
