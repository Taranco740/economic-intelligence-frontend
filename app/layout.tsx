import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Economic Intelligence",
  description: "Data analysis, forecasting, AI insights, and reporting.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
