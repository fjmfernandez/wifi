import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WiFi ENTELSAT", template: "%s · WiFi ENTELSAT" },
  description: "Gestión segura de WiFi, portales cautivos y acceso para organizaciones multisede.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { colorScheme: "light", themeColor: "#f8fafc" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
