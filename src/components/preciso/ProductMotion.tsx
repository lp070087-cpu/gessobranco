import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/** One observer per route. Content stays visible if animations are unavailable. */
export function ProductMotion() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!preference.matches) entry.target.classList.add("ouro-enter");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08 },
    );

    const elements = document.querySelectorAll(
      "[data-reveal], .preciso-admin main > *, .preciso-client main > *, .preciso-auth .auth-card",
    );
    elements.forEach((element) => {
      element.classList.remove("ouro-enter");
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
