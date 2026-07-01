import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { manualSync } from "@/lib/sync/init";
import { toast } from "sonner";

const TRIGGER = 70; // px pulled before releasing triggers refresh
const MAX = 110;    // px cap on visual pull

export function PullToRefresh({ children }: { children: ReactNode }) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    function atTop() {
      return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    }
    function onStart(e: TouchEvent) {
      if (refreshing) return;
      if (!atTop()) return;
      startY.current = e.touches[0].clientY;
    }
    function onMove(e: TouchEvent) {
      if (startY.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // dampen the pull for a "rubber band" feel
      const damped = Math.min(MAX, dy * 0.5);
      setPull(damped);
      if (damped > 5 && e.cancelable) e.preventDefault();
    }
    async function onEnd() {
      if (startY.current == null) return;
      const p = pullRef.current;
      startY.current = null;
      if (p >= TRIGGER && !refreshing) {
        setRefreshing(true);
        setPull(TRIGGER);
        try {
          await manualSync();
          await qc.invalidateQueries();
          toast.success("Sincronizado");
        } catch {
          toast.error("Falha ao sincronizar");
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refreshing, qc]);

  // Keep latest pull in a ref so onEnd sees the current value.
  const pullRef = useRef(0);
  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  const armed = pull >= TRIGGER;
  return (
    <>
      <div
        aria-hidden={!pull && !refreshing}
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
        style={{
          top: "calc(env(safe-area-inset-top) + 8px)",
          transform: `translateY(${Math.max(0, pull - 40)}px)`,
          opacity: pull > 0 || refreshing ? 1 : 0,
          transition: startY.current == null ? "transform 200ms ease, opacity 200ms ease" : "none",
        }}
      >
        <div className="flex size-10 items-center justify-center rounded-full border border-border bg-card shadow-md">
          {refreshing ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <ArrowDown
              className={`size-5 transition-transform ${armed ? "rotate-180 text-primary" : "text-muted-foreground"}`}
            />
          )}
        </div>
      </div>
      <div
        style={{
          transform: pull > 0 && !refreshing ? `translateY(${pull * 0.4}px)` : "none",
          transition: startY.current == null ? "transform 200ms ease" : "none",
        }}
      >
        {children}
      </div>
    </>
  );
}