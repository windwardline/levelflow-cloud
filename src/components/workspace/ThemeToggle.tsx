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
    // `.seg` (p-profile-v2.html:27-29, approved under §17e): an outline
    // segmented pill — hairline border, 8px radius, 3px inset, 2px between
    // options — with no fill of its own, so it reads as a control sitting on
    // the page's paper rather than as another small sheet. One component, so
    // the Auth and Parking screens' compact toggles take the same geometry:
    // it is the same control, and the mocks leave those screens' own
    // composition alone rather than prescribing a second pill for them.
    <div
      className="inline-flex gap-0.5 rounded-lg border border-hairline p-[3px]"
      aria-label="Theme"
    >
      {options.map((option) => (
        // `.o` (:28) at the mock's own type and padding. min-h-11 keeps every
        // theme control at the 44px hit target the accessibility bar asks for —
        // spec §16 trims padding and type size, never the hit area — and the
        // icons stay small inside it.
        <button
          key={option.value}
          className={`flex min-h-11 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold transition ${mode === option.value ? "bg-accent/10 text-accent" : "text-ink-muted hover:text-ink"}`}
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
