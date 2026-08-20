import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "B2B Lead Extractor",
  description: "Industry-filtered B2B lead dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
