import type { Metadata } from "next";
import { IBM_Plex_Mono, Playfair_Display, Public_Sans } from "next/font/google";

import "./globals.css";

const playfair = Playfair_Display({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: "900",
});

const publicSans = Public_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-public-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: "400",
});

export const metadata: Metadata = {
  description:
    "Pressure-test campaign messages before fieldwork with a traceable, explicitly experimental decision-rehearsal workspace.",
  icons: {
    icon: "/brand/simula-mark-minimal.png",
  },
  title: {
    default: "SIMULA — decision rehearsal, with receipts",
    template: "%s · SIMULA",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${playfair.variable} ${publicSans.variable} ${ibmPlexMono.variable}`}
      data-scroll-behavior="smooth"
      lang="en"
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
