import type { Metadata } from "next";
import { Fraunces } from "next/font/google";

// The concept is typographic: a characterful display serif carries every
// heading and every line of prose. Fraunces (variable, optical-size axis)
// gives us the monograph voice — high contrast, a touch of "wonk". Captions
// and specs stay on JetBrains Mono (--font-mono, declared in the root layout).
const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
});

export const metadata: Metadata = {
  title: "The Catalogue — one file, catalogued · ifcfast",
  description:
    "A printed catalogue of a single IFC building file, read by ifcfast: the whole model, its 41 type specimens as plates, and the quantities set as an index.",
};

export default function CatalogueLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className={fraunces.variable}>{children}</div>;
}
