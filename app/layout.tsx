import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://findo-on.vercel.app"),
  applicationName: "Findo-On",
  title: {
    default: "Findo-On | B2B Lead Finder for Indore",
    template: "%s | Findo-On",
  },
  description:
    "Find industry-filtered B2B business leads in Indore with contact details, websites, locations, and export options.",
  keywords: ["B2B leads", "Indore leads", "business directory", "lead finder", "Findo-On"],
  icons: {
    icon: "/icon.jpg",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Findo-On",
    title: "Findo-On | B2B Lead Finder for Indore",
    description:
      "Find industry-filtered B2B business leads in Indore with contact details, websites, locations, and export options.",
    images: ["/icon.jpg"],
  },
  twitter: {
    card: "summary",
    title: "Findo-On | B2B Lead Finder for Indore",
    description: "Find industry-filtered B2B business leads in Indore.",
    images: ["/icon.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Findo-On",
  alternateName: "Findo On",
  url: "https://findo-on.vercel.app/",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
