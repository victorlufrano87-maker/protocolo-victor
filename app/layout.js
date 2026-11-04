import "./globals.css";

export const metadata = {
  title: "Tropa do Batata",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Tropa do Batata", statusBarStyle: "black-translucent" },
  icons: { icon: "/gym-rats-icon.svg", apple: "/gym-rats-180.png" },
};
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#09090b" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
