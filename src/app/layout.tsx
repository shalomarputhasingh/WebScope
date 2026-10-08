import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebScope — AI Research Reports",
  description: "Enter a topic. WebScope researches the web and emails you a cited PDF report with a short summary.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
