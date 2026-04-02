import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/ThemeContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "WORLDVIEW // ORBITAL TRACKING",
  description: "Advanced Geopolitical Risk Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head />
      <body
        className="antialiased bg-[var(--bg-primary)]"
        suppressHydrationWarning
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
