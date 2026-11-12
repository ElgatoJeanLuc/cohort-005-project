// PROTOTYPE: throwaway variant switcher. Never merge into main.
import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
  children?: React.ReactNode;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
  children,
}: PrototypeSwitcherProps) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );

  function step(delta: number) {
    const next = (index + delta + variants.length) % variants.length;
    onChange(variants[next].key);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  const variant = variants[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <button
        onClick={() => step(-1)}
        className="rounded-full p-1 hover:bg-white/15"
        title="Previous variant (←)"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 px-2 text-center font-medium">
        {variant.key} ({variant.name})
      </span>
      <button
        onClick={() => step(1)}
        className="rounded-full p-1 hover:bg-white/15"
        title="Next variant (→)"
      >
        <ChevronRight className="size-4" />
      </button>
      {children && (
        <div className="ml-1 flex items-center gap-1 border-l border-white/20 pl-2">
          {children}
        </div>
      )}
    </div>
  );
}
