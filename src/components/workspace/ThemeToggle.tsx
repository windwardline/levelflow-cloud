import type { ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemeMode } from "../../lib/profile";

type ThemeToggleProps = {
  compact?: boolean;
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
};

export function ThemeToggle({
  compact = false,
  mode,
  onChange,
}: ThemeToggleProps) {
  const options: Array<{ icon: ReactNode; label: string; value: ThemeMode }> = [
    {
      icon: <Sun className="h-4 w-4" aria-hidden="true" />,
      label: "Light",
      value: "light",
    },
    {
      icon: <Moon className="h-4 w-4" aria-hidden="true" />,
      label: "Dark",
      value: "dark",
    },
    {
      icon: <Monitor className="h-4 w-4" aria-hidden="true" />,
      label: "System",
      value: "system",
    },
  ];

  return (
    <div
      className="inline-flex rounded-lg border border-hairline bg-sheet p-1"
      aria-label="Theme"
    >
      {options.map((option) => (
        // min-h-11 keeps every theme control at the 44px hit target the
        // accessibility bar asks for; the icons stay small inside it.
        <button
          key={option.value}
          className={`flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-bold transition ${mode === option.value ? "bg-accent/10 text-accent" : "text-ink-muted hover:text-ink"}`}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {compact ? (
            <span className="sr-only">{option.label}</span>
          ) : (
            option.label
          )}
        </button>
      ))}
    </div>
  );
}
