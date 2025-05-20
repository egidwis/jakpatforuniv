"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import ClientOnly from "./client-only";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface SurveyInfo {
  title: string;
  description: string;
  questionCount: number | string;
  platform: string;
  formId?: string;
  isQuiz?: boolean;
  requiresLogin?: boolean;
  isPaidFeature?: boolean;
  sectionCount?: number;
  note?: string;
}

export function SurveyResult({ data }: { data: SurveyInfo | null }) {
  const [isCopied, setIsCopied] = useState(false);

  if (!data) return null;

  const isGoogleForms = data.platform === "Google Forms";

  // Fungsi untuk menyalin informasi survei ke clipboard
  const copyToClipboard = () => {
    const text = `
Judul: ${data.title || "Tidak tersedia"}
Deskripsi: ${data.description || "Tidak tersedia"}
Jumlah Pertanyaan: ${data.questionCount}
Platform: ${data.platform}
${data.formId ? `ID Form: ${data.formId}` : ""}
${data.sectionCount ? `Jumlah Section: ${data.sectionCount}` : ""}
${data.isQuiz !== undefined ? `Tipe: ${data.isQuiz ? "Kuis" : "Formulir"}` : ""}
${data.requiresLogin ? "Login Diperlukan: Ya" : ""}
${data.isPaidFeature ? "Fitur Berbayar: Ya" : ""}
    `.trim();

    navigator.clipboard.writeText(text)
      .then(() => {
        setIsCopied(true);
        toast.success("Informasi survei berhasil disalin");
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch(err => {
        console.error("Gagal menyalin teks: ", err);
        toast.error("Gagal menyalin informasi survei");
      });
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl">{data.title || "Tidak tersedia"}</CardTitle>
          <div className="flex items-center gap-2">
            <ClientOnly>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={copyToClipboard}
                title="Salin informasi survei"
              >
                {isCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="sr-only">Salin informasi</span>
              </Button>
            </ClientOnly>
            <Badge variant={isGoogleForms ? "default" : "secondary"}>
              {data.platform}
            </Badge>
          </div>
        </div>
        <CardDescription>
          {data.description || "Tidak tersedia"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Jumlah Pertanyaan</h4>
            <p className="text-lg font-semibold">{data.questionCount}</p>
          </div>

          {data.sectionCount && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Jumlah Section</h4>
              <p className="text-lg font-semibold">{data.sectionCount}</p>
            </div>
          )}

          {data.formId && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">ID Form</h4>
              <p className="text-sm font-mono bg-muted p-1 rounded">{data.formId}</p>
            </div>
          )}

          {isGoogleForms && typeof data.isQuiz !== 'undefined' && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Tipe</h4>
              <p>{data.isQuiz ? "Kuis" : "Formulir"}</p>
            </div>
          )}
        </div>

        {!isGoogleForms && (
          <div className="pt-2">
            <Separator className="my-4" />
            <div className="text-sm text-muted-foreground">
              <p>Aplikasi ini dioptimalkan untuk Google Forms. Informasi untuk platform lain mungkin tidak lengkap.</p>
            </div>
          </div>
        )}

        {data.note && (
          <div className="pt-2">
            <Separator className="my-4" />
            <div className="text-sm text-muted-foreground">
              <p>{data.note}</p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {data.requiresLogin && (
          <Badge variant="outline" className="mr-2">
            Login Diperlukan
          </Badge>
        )}
        {data.isPaidFeature && (
          <Badge variant="outline">Fitur Berbayar</Badge>
        )}
      </CardFooter>
    </Card>
  );
}
