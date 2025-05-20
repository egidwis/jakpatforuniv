import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { ClientOnly } from "./ClientOnly";
import type { SurveyInfo } from "../lib/types";
import { toast } from "sonner";

interface SurveyResultProps {
  data: SurveyInfo;
}

export function SurveyResult({ data }: SurveyResultProps) {
  const [isCopied, setIsCopied] = useState(false);

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
    <div className="card max-w-2xl mx-auto">
      <div className="card-header">
        <div className="flex justify-between items-start">
          <h3 className="card-title">{data.title || "Tidak tersedia"}</h3>
          <div className="flex items-center gap-2">
            <ClientOnly>
              <button
                className="button button-outline button-icon"
                onClick={copyToClipboard}
                title="Salin informasi survei"
              >
                {isCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="sr-only">Salin informasi</span>
              </button>
            </ClientOnly>
            <span className={`badge ${isGoogleForms ? 'badge-primary' : 'badge-secondary'}`}>
              {data.platform}
            </span>
          </div>
        </div>
        <p className="card-description">
          {data.description || "Tidak tersedia"}
        </p>
      </div>
      <div className="card-content space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Jumlah Pertanyaan</h4>
            <p className="text-2xl font-bold">{data.questionCount}</p>
          </div>

          {data.sectionCount && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Jumlah Section</h4>
              <p className="text-2xl font-bold">{data.sectionCount}</p>
            </div>
          )}
        </div>

        <div className="separator"></div>

        <div className="space-y-2">
          {data.formId && (
            <div className="flex justify-between">
              <span className="text-sm text-muted">ID Form</span>
              <span className="text-sm font-medium">{data.formId}</span>
            </div>
          )}

          {data.isQuiz !== undefined && (
            <div className="flex justify-between">
              <span className="text-sm text-muted">Tipe</span>
              <span className="text-sm font-medium">
                {data.isQuiz ? "Kuis" : "Formulir"}
              </span>
            </div>
          )}

          {data.requiresLogin && (
            <div className="flex justify-between">
              <span className="text-sm text-muted">Login Diperlukan</span>
              <span className="text-sm font-medium">Ya</span>
            </div>
          )}

          {data.isPaidFeature && (
            <div className="flex justify-between">
              <span className="text-sm text-muted">Fitur Berbayar</span>
              <span className="text-sm font-medium">Ya</span>
            </div>
          )}
        </div>

        {data.note && (
          <>
            <div className="separator"></div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Catatan</h4>
              <p className="text-sm text-muted">{data.note}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
