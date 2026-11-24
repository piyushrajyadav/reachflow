import { Link, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";

function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <p className="font-display text-5xl">404</p>
      <p className="mt-2 text-[13px] text-muted">That page doesn’t exist.</p>
      <Link to="/" className="mt-4 text-[13px] font-medium text-brand hover:underline">Back to emails</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
