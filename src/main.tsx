import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Only the default family, only Latin, only the weights the interface uses.
// The other four families load on demand — see src/lib/fonts.ts
// (REVIEW-BACKLOG.md E2).
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./lib/ThemeContext";
import { I18nProvider } from "./lib/I18nContext";
import { ToastProvider } from "./lib/ToastContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
);
