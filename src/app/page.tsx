"use client";

import { useState, useEffect } from "react";
import { SurveyForm } from "@/components/survey-form";
import { SurveyResult, SurveyInfo } from "@/components/survey-result";
import { SurveyResultSkeleton } from "@/components/survey-result-skeleton";
import { SearchHistory } from "@/components/search-history";
import { extractSurveyInfo } from "@/lib/survey-service";
import { addToSearchHistory } from "@/lib/search-history";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  const [surveyInfo, setSurveyInfo] = useState<SurveyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string>("");

  async function handleSubmit(data: { surveyUrl: string }) {
    setIsLoading(true);
    try {
      const info = await extractSurveyInfo(data.surveyUrl);
      setSurveyInfo(info);

      // Tambahkan ke riwayat pencarian
      addToSearchHistory({
        url: data.surveyUrl,
        timestamp: Date.now(),
        platform: info.platform,
        title: info.title
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Fungsi untuk menangani pemilihan URL dari riwayat
  const handleSelectUrl = (url: string) => {
    setSelectedUrl(url);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto py-6">
          <div className="flex justify-end mb-4">
            <ThemeToggle />
          </div>
          <h1 className="text-3xl font-bold text-center">
            Universal Survey Extractor
          </h1>
          <p className="text-center text-muted-foreground mt-2">
            Ekstrak informasi dari berbagai platform survei online
          </p>
        </div>
      </header>

      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="grid gap-8 md:gap-12">
          <section>
            <h2 className="text-xl font-semibold mb-4 text-center">
              Masukkan URL Survei
            </h2>
            <SurveyForm onSubmit={handleSubmit} initialUrl={selectedUrl} />
            <SearchHistory onSelectUrl={handleSelectUrl} />
          </section>

          {isLoading && (
            <section>
              <h2 className="text-xl font-semibold mb-4 text-center">
                Memuat Informasi Survei...
              </h2>
              <SurveyResultSkeleton />
            </section>
          )}

          {!isLoading && surveyInfo && (
            <section>
              <h2 className="text-xl font-semibold mb-4 text-center">
                Informasi Survei
              </h2>
              <SurveyResult data={surveyInfo} />
            </section>
          )}
        </div>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>
            Universal Survey Extractor | Dibuat dengan{" "}
            <a
              href="https://ui.shadcn.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-primary"
            >
              shadcn/ui
            </a>
          </p>
        </div>
      </footer>

      <Toaster />
    </div>
  );
}
