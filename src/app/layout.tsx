import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { ProvedorTema } from "@/features/tema/components/provedor-tema";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Portal TG",
    template: "%s | Portal TG",
  },
  description: "Portal TG",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // `suppressHydrationWarning` so no <html>: o script do `next-themes` poe a
  // classe `dark` antes da hidratacao, e o React acusaria a diferenca com o HTML
  // do servidor, que nao sabe o tema. Vale para este elemento, e nao para os filhos.
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ProvedorTema>
          {children}
          <Toaster />
        </ProvedorTema>
      </body>
    </html>
  );
}
