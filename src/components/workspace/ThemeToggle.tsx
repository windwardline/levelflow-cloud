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

  // Owner ruling (2026-08-02), for the compact toggle the two pre-auth screens
  // carry: "like everything else on the mobile view, it should be smaller — as
  // small as possible on the mobile view while still being usable and legible."
  //
  // Smaller is the VISIBLE box. The target is not negotiable (§16 trims padding
  // and type size, never the hit area), so this is .tertiary-link's own trick
  // (src/styles/index.css) on both axes: a 44px box pulled back by negative
  // margins. -my-2 leaves 28px of visible height with 44px of vertical reach, and
  // min-w-11 with -mx-px leaves 42px of visible width with 44px of horizontal
  // reach — 1px per side, which the pill's own 2px gap absorbs exactly, so no two
  // options can claim the same pixel. Measured: the pill goes from 144x52 to
  // 138x36, and every option keeps a full 44x44 target. The icons hold at 16px,
  // which is the legibility half of the ruling.
  //
  // Two whole literals rather than a base list with an override appended: two
  // unprefixed utilities for one property resolve by stylesheet order, which is
  // not something a call site can see. `sm:` restores today's geometry exactly, so
  // the desktop login screen and Profile's row (which never takes this branch) are
  // both untouched.
  const optionClassName = compact
    ? "flex min-h-11 min-w-11 -mx-px -my-2 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold transition sm:mx-0 sm:my-0 sm:min-w-0 sm:px-3.5"
    : "flex min-h-11 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold transition";

  return (
    // `.seg` (p-profile-v2.html:27-29, approved under §17e): an outline
    // segmented pill — hairline border, 8px radius, 3px inset, 2px between
    // options — with no fill of its own, so it reads as a control sitting on
    // the page's paper rather than as another small sheet. One component, so
    // the Auth and Parking screens' compact toggles take the same geometry:
    // it is the same control, and the mocks leave those screens' own
    // composition alone rather than prescribing a second pill for them.
    // Q1-I5: role="group" is what makes the aria-label above readable at all —
    // an aria-label on a bare <div> with no role is dropped by most assistive
    // technology, so this control had no accessible name. The active mode is
    // aria-pressed on each option rather than the `bg-accent/10 text-accent`
    // fill alone: a colour is not a state, and this is Profile's only
    // interactive control as well as the Auth and Parking screens' compact
    // toggle. Toggle buttons rather than a radiogroup, deliberately — three
    // independent presses, no arrow-key model to get half-right, and the
    // geometry the mock draws is untouched either way.
    <div
      aria-label="Theme"
      className="inline-flex gap-0.5 rounded-lg border border-hairline p-[3px]"
      role="group"
    >
      {options.map((option) => (
        // `.o` (:28) at the mock's own type and padding. min-h-11 keeps every
        // theme control at the 44px hit target the accessibility bar asks for —
        // spec §16 trims padding and type size, never the hit area — and the
        // icons stay small inside it. The compact branch shrinks what can be seen
        // and nothing that can be tapped (see optionClassName above).
        <button
          key={option.value}
          aria-pressed={mode === option.value}
          className={`${optionClassName} ${mode === option.value ? "bg-accent/10 text-accent" : "text-ink-muted hover:text-ink"}`}
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
