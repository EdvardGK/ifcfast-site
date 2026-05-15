import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ifcfast — the agent-first IFC parser",
  description:
    "Fast native IFC parsing for AI agents, RPA, and analytics pipelines. 20–30× faster than ifcopenshell.open. Rust core, Python API, MCP server. No geometry kernel required.",
  keywords: [
    "IFC", "BIM", "parser", "AEC", "Rust", "Python", "MCP",
    "AI agents", "ifcopenshell", "spatial graph",
  ],
  authors: [{ name: "Edvard Granskogen Kjorstad" }],
  openGraph: {
    title: "ifcfast — the agent-first IFC parser",
    description:
      "20–30× faster than ifcopenshell.open. Built for AI agents.",
    type: "website",
    url: "https://ifcfast.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="bg-bg text-fg font-sans min-h-screen flex flex-col selection:bg-accent/40 selection:text-fg">
        {children}
      </body>
    </html>
  );
}
