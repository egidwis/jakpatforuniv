import { Zap } from 'lucide-react';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import type { SurveySubmission, ExistingPage } from '../types';
import { formatDate } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { PageAction, ExtendAction } from '../CampaignActions';

// ─────────────────────────────────────────────────────────────
// Tab: Page — page status + Page Builder entry point + Extend
// ─────────────────────────────────────────────────────────────

export function PageTab({
  submission,
  existingPage,
  lifecycle,
  onOpenPageBuilder,
  onExtendCreated,
}: {
  submission: SurveySubmission;
  existingPage?: ExistingPage;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenPageBuilder: (submission: SurveySubmission) => void;
  onExtendCreated: () => void;
}) {
  const isKilat = submission.distribution_type === 'kilat';

  return (
    <>
      <DetailSheetSection title="Status Page">
        {isKilat ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
            <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Distribusi Kilat.</span> Tidak menggunakan Page builder — survey
              didistribusikan langsung ke panel.
            </p>
          </div>
        ) : existingPage ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
            <div className="grid grid-cols-[auto_1fr] !gap-x-3 !gap-y-1 text-xs">
              <span className="text-gray-400">Status</span>
              <span className="font-semibold text-gray-900 capitalize">{lifecycle.pageStatus}</span>
              <span className="text-gray-400">Title</span>
              <span className="font-medium text-gray-900">{existingPage.title || 'Not set'}</span>
              <span className="text-gray-400">Slug</span>
              <span className="font-mono text-[11px] text-gray-700">/{existingPage.slug}</span>
              <span className="text-gray-400">Publish</span>
              <span className="font-medium text-gray-900">
                {formatDate(existingPage.publish_start_date)} — {formatDate(existingPage.publish_end_date)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2.5">
            Belum ada page. {!lifecycle.canBuildPage && 'Page bisa dibuat setelah pembayaran diterima.'}
          </p>
        )}
      </DetailSheetSection>

      {!isKilat && (
        <DetailSheetSection title="Aksi">
          <PageAction
            submission={submission}
            existingPage={existingPage}
            lifecycle={lifecycle}
            onOpenPageBuilder={onOpenPageBuilder}
          />
          <ExtendAction
            submission={submission}
            existingPage={existingPage}
            lifecycle={lifecycle}
            onExtendCreated={onExtendCreated}
          />
        </DetailSheetSection>
      )}
    </>
  );
}
