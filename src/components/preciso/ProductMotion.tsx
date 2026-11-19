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

    // The public catalogue loads after the route renders.
    const catalogue = document.querySelector(".catalogue-grid");
    const catalogueObserver = catalogue
      ? new MutationObserver((changes) => {
          for (const change of changes) {
            for (const card of change.addedNodes) {
              if (card instanceof HTMLElement && card.hasAttribute("data-reveal")) {
                observer.observe(card);
              }
            }
            for (const card of change.removedNodes) {
              if (card instanceof HTMLElement) observer.unobserve(card);
            }
          }
        })
      : null;
    if (catalogue) catalogueObserver?.observe(catalogue, { childList: true });

    return () => {
      catalogueObserver?.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
