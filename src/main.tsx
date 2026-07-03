import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./app/App.tsx";
import { initMonitoring } from "./lib/monitoring";
import "./styles/index.css";

initMonitoring();

function ErrorFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif", textAlign: "center" }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Algo deu errado.</h1>
        <p style={{ color: "#666" }}>Nossa equipe já foi notificada. Tente recarregar a página.</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
    <App />
  </Sentry.ErrorBoundary>
);
