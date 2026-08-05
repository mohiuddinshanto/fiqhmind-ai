import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "FiqhMind AI",
  description: "Multilingual Islamic fiqh assistant grounded in the Arabic Hanafi corpus.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="bn">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
