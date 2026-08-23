import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WPass", template: "%s · WPass" },
  description: "WiFi marketing, portales cautivos y vouchers para hoteles y eventos.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { colorScheme: "light", themeColor: "#f1ba1b" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
