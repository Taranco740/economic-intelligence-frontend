import type { Metadata } from "next";
import "./globals.css";
import "./components/artifact-views.module.css";
import { LanguageProvider } from "./components/language-provider";
import { AuthGate } from "./components/auth-gate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Gamur — Economic Intelligence",
  description: "Learn, ask questions, analyze data, forecast, visualize, and create reports with Gamuur.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><LanguageProvider><AuthGate>{children}</AuthGate></LanguageProvider></body></html>;
}
