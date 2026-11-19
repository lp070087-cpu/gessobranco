import { useRouterState } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

const blocks = [0, 1, 2];
const bars = [0, 1, 2, 3];

function SkeletonCards() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true">
      {blocks.map((index) => (
        <Skeleton
          key={index}
          className="h-20 rounded-xl bg-foreground/10 motion-reduce:animate-none sm:h-24"
        />
      ))}
    </div>
  );
}

export function PanelSkeleton({ label = "Carregando conteúdo…" }: { label?: string }) {
  return (
    <div className="my-4 space-y-3" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton
        className="h-4 w-1/3 bg-foreground/10 motion-reduce:animate-none"
        aria-hidden="true"
      />
      <SkeletonCards />
      <Skeleton
        className="h-10 w-full rounded-lg bg-foreground/10 motion-reduce:animate-none"
        aria-hidden="true"
      />
    </div>
  );
}

export function LoadingSkeleton({ sidebar = false }: { sidebar?: boolean }) {
  return (
    <div className="mx-auto min-h-[70svh] w-full max-w-7xl px-4 py-7 md:px-8">
      <div className="mb-5 flex items-center justify-between gap-4" aria-hidden="true">
        <Skeleton className="h-7 w-36 bg-foreground/10 motion-reduce:animate-none" />
        <Skeleton className="h-10 w-20 rounded-lg bg-foreground/10 motion-reduce:animate-none" />
      </div>
      <div className={sidebar ? "grid gap-5 md:grid-cols-[12rem_minmax(0,1fr)]" : "grid gap-5"}>
        {sidebar && (
          <div
            className="hidden space-y-3 rounded-xl border border-border p-4 md:block"
            aria-hidden="true"
          >
            {bars.map((index) => (
              <Skeleton
                key={index}
                className="h-8 w-full bg-foreground/10 motion-reduce:animate-none"
              />
            ))}
          </div>
        )}
        <div className="min-w-0 rounded-xl border border-border bg-background px-4 sm:px-6">
          <PanelSkeleton label="Carregando página…" />
          <Skeleton
            className="mb-5 h-24 w-full rounded-lg bg-foreground/10 motion-reduce:animate-none sm:h-36"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

export function RoutePendingSkeleton() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return <LoadingSkeleton sidebar={/^\/(admin|workspace|minha-conta)(\/|$)/.test(path)} />;
}
