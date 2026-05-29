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
  title: "ifcfast — an open IFC parser for data and geometry",
  description:
    "An open, experimental IFC parser with a Python API. Reads IFC data and geometry into pandas, meshes, and point clouds — no geometry kernel on the hot path. Built for agents, analytics, and pipelines. Early and under active development.",
  keywords: [
    "IFC", "BIM", "parser", "AEC", "Rust", "Python", "MCP",
    "AI agents", "ifcopenshell", "spatial graph", "point cloud", "mesh",
  ],
  authors: [{ name: "Edvard Granskogen Kjorstad" }],
  openGraph: {
    title: "ifcfast — an open IFC parser for data and geometry",
    description:
      "An open, experimental IFC parser. IFC → pandas, meshes, point clouds. Early and under active development — contributions welcome.",
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
