import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { rememberRunningBundle } from "./lib/deployedVersion";
import "./styles/index.css";

// The running bundle's own identity, taken where it is true: `import.meta.url` in
// the ENTRY module resolves to the entry chunk the browser loaded, and every other
// module would name whichever chunk it was bundled into instead
// (src/lib/deployedVersion.ts's header). Taken before the first render, because
// the Desk's own mount effects can have an analyzer request in flight within a
// frame of it and every request carries this stamp.
rememberRunningBundle(import.meta.url);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
