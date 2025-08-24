import { createRoot } from "react-dom/client";
import { OptionsApp } from "@/components/OptionsApp";
import { initializeTheme } from "@/lib/theme";
import "@/styles/globals.css";

// Initialize theme detection
initializeTheme();

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<OptionsApp />);
}
