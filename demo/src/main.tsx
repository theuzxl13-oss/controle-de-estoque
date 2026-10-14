import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { FeedbackProvider } from "./components/ui";
import "./index.css";
import { StoreProvider } from "./store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </StoreProvider>
  </StrictMode>,
);
