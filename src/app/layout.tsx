import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { appAuthStatus, getCurrentAppUser } from "@/services/authService";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Waimao Agent Platform",
  description: "B2B export lead generation agent platform"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authStatus = appAuthStatus();
  const user = authStatus.enabled ? await getCurrentAppUser() : null;

  return (
    <html lang="en">
      <body>
        <AppShell authEnabled={authStatus.enabled} userEmail={user?.email}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
