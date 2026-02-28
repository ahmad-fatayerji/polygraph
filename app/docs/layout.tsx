import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PolyGraph JSON Docs",
  description:
    "Documentation for the PolyGraph JSON model specification — actors, channels, rational numbers, and verification.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
