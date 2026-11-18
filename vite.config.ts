import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// TanStack Start remains the framework. Nitro emits the hosting adapter;
// on Vercel its build uses the Vercel Build Output API and a Node runtime.
// Keep the existing server wrapper for branded, sanitized error responses.
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    nitro({ buildDir: ".nitro" }),
    react(),
  ],
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
  server: { host: "0.0.0.0", port: 3000 },
});
