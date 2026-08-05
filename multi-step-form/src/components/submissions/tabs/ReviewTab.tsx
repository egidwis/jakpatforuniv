import { Copy, ExternalLink, Globe, PenLine, ShieldAlert } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import type { SurveySubmission } from '../types';
import { copyToClipboard } from '../types';

// ─────────────────────────────────────────────────────────────
// Tab: Review (default) — survey preview & review decision inputs
// ─────────────────────────────────────────────────────────────

export function ReviewTab({
  submission,
  onEditFormDetails,
}: {
  submission: SurveySubmission;
  onEditFormDetails: (submission: SurveySubmission) => void;
}) {
  return (
    <>
      {/* Survey preview */}
      <DetailSheetSection
        title="Kuesioner"
        className="flex flex-col flex-1 h-full"
        action={
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onEditFormDetails(submission)}
                  >
                    <PenLine className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-950 px-2 py-1 text-white text-[11px] rounded shadow-md">
                  Edit Link
                </TooltipContent>
              </Tooltip>

              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyToClipboard(submission.formUrl, 'Survey link copied!')}
                    disabled={!submission.formUrl}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-950 px-2 py-1 text-white text-[11px] rounded shadow-md">
                  Copy Link
                </TooltipContent>
              </Tooltip>

              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => window.open(submission.formUrl, '_blank', 'noopener,noreferrer')}
                    disabled={!submission.formUrl}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-950 px-2 py-1 text-white text-[11px] rounded shadow-md">
                  Buka Link
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        }
      >
        {submission.formUrl ? (
          <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
            <div className="px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-1.5 min-w-0">
              <Globe className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-[11px] text-gray-500 truncate">{submission.formUrl.replace(/^https?:\/\//, '')}</span>
            </div>
            
            {submission.formUrl.includes('docs.google.com') && !submission.formUrl.includes('/d/e/') ? (
              <div className="flex-1 bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-4 border shadow-sm">
                  <ExternalLink className="w-5 h-5 text-gray-400" />
                </div>
                <h4 className="text-sm font-medium text-gray-900 mb-1.5">Preview Tidak Tersedia</h4>
                <p className="text-xs text-gray-500 max-w-[280px] mb-5 leading-relaxed">
                  Sistem keamanan Google membatasi preview untuk tautan editor. Silakan buka form di tab baru untuk mengecek tampilannya.
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white border-gray-300 hover:bg-gray-50"
                  onClick={() => window.open(submission.formUrl, '_blank', 'noopener,noreferrer')}
                >
                  Buka Preview di Tab Baru <ExternalLink className="w-3.5 h-3.5 ml-2" />
                </Button>
              </div>
            ) : (
              <iframe
                src={submission.formUrl}
                title={`Preview: ${submission.formTitle}`}
                className="w-full flex-1 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            )}
            
            <p className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-200 bg-white">
              Preview kosong? Situs survei memblokir embed — gunakan tombol "Buka" di atas.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-xs text-gray-400">
            Tidak ada link survey.
          </div>
        )}
        {submission.detected_keywords && submission.detected_keywords.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 mt-3">
            <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              Detected keywords: <span className="font-medium">{submission.detected_keywords.join(', ')}</span>
            </p>
          </div>
        )}
      </DetailSheetSection>
    </>
  );
}
