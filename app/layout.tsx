import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "stonks", description: "Trust-aware investment analysis" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
