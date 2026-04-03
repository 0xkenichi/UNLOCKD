import type { Metadata } from "next";
import { Inter, Montserrat, JetBrains_Mono } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Web3Provider } from "@/components/providers/web3-provider";
import AIBubble from "@/components/common/AIBubble";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Vestra Protocol — Premium Vesting-Credit Protocol",
  description: "Advanced credit infrastructure from vested tokens — non-custodial and auto-settled.",
  metadataBase: new URL("https://vestraprotocol.vercel.app"),
  other: {
    "base:app_id": "69c8015f480a9d8cb993adef",
  },
  openGraph: {
    type: "website",
    title: "Vestra Protocol — Vesting Credit",
    description: "Borrow against vested tokens without custody. DPV valuation, auto-settlement, institutional-grade.",
    images: ["/favicon.ico"],
    url: "https://vestraprotocol.vercel.app",
    siteName: "Vestra Protocol",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vestra Protocol — Vesting Credit",
    description: "Non-custodial credit against vested tokens. DPV-powered valuation with auto-settlement.",
    images: ["/favicon.ico"],
    creator: "@VestraProtocol",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vestra Protocol",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0e14",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground selection:bg-accent-teal/30">
        <Web3Provider>
          {children}
          <AIBubble />
        </Web3Provider>
      </body>
    </html>
  );
}
