import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { isUnauthorized } from "./api/client";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      refetchOnWindowFocus: true,
      // An expired session is not worth retrying; transient network errors are.
      retry: (count, error) => !isUnauthorized(error) && count < 2
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: "#17191f", color: "#f6f5f1", fontSize: "13px", borderRadius: "8px", padding: "10px 14px" },
          success: { iconTheme: { primary: "#5fcfae", secondary: "#17191f" } }
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>
);
