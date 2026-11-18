import type { Metadata } from "next";
import FreeCheck from "./FreeCheck";

export const metadata: Metadata = {
  title: "Ücretsiz AI Görünürlük Testi — Siten ChatGPT ve Gemini'ye hazır mı? | Epicsem",
  description: "Sitenin ChatGPT, Gemini, Perplexity ve Google AI Overviews'da kaynak gösterilmeye hazır olup olmadığını 30 saniyede ücretsiz test et: AI botları, llms.txt, yapısal veri, cevap-önce içerik.",
  alternates: { canonical: "/ai-gorunurluk-testi" },
};

export default function Page() {
  return <FreeCheck />;
}
