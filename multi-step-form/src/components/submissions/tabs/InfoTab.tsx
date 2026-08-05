import { useState, useCallback } from 'react';
import { PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import { updateFormDetails, updateSubmissionCriteria } from '../../../utils/supabase';
import type { SurveySubmission } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { LifecycleChip } from '../LifecycleChip';

// ─────────────────────────────────────────────────────────────
// Tab: Info — submission summary & researcher profile
// ─────────────────────────────────────────────────────────────

export function InfoTab({
  submission,
  lifecycle,
  onDataUpdated,
}: {
  submission: SurveySubmission;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onDataUpdated: () => void;
}) {
  type EditSection = 'submission' | 'criteria' | 'incentive' | null;
  const [editing, setEditing] = useState<EditSection>(null);
  const [saving, setSaving] = useState(false);

  // Draft states for Submission section
  const [draftTitle, setDraftTitle] = useState('');
  const [draftQuestions, setDraftQuestions] = useState('');
  const [draftDuration, setDraftDuration] = useState('');

  // Draft states for Kriteria section
  const [draftCriteria, setDraftCriteria] = useState('');

  // Draft states for Insentif section
  const [draftPrize, setDraftPrize] = useState('');
  const [draftWinners, setDraftWinners] = useState('');

  const startEdit = useCallback((section: EditSection) => {
    if (section === 'submission') {
      setDraftTitle(submission.formTitle || '');
      setDraftQuestions(submission.questionCount?.toString() || '');
      setDraftDuration(submission.duration?.toString() || '');
    } else if (section === 'criteria') {
      setDraftCriteria(submission.criteria || '');
    } else if (section === 'incentive') {
      setDraftPrize(submission.prize_per_winner?.toString() || '');
      setDraftWinners(submission.winnerCount?.toString() || '');
    }
    setEditing(section);
  }, [submission]);

  const cancelEdit = () => setEditing(null);

  const handleSaveSubmission = async () => {
    setSaving(true);
    try {
      await updateFormDetails(submission.id, {
        title: draftTitle,
        survey_url: submission.formUrl,
        question_count: parseInt(draftQuestions) || 0,
        duration: parseInt(draftDuration) || 0,
      });
      toast.success('Detail submission diperbarui');
      setEditing(null);
      onDataUpdated();
    } catch {
      toast.error('Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCriteria = async () => {
    setSaving(true);
    try {
      await updateSubmissionCriteria(
        submission.id,
        draftCriteria,
        submission.prize_per_winner || 0,
        submission.winnerCount || 0,
      );
      toast.success('Kriteria diperbarui');
      setEditing(null);
      onDataUpdated();
    } catch {
      toast.error('Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIncentive = async () => {
    setSaving(true);
    try {
      await updateSubmissionCriteria(
        submission.id,
        submission.criteria || '',
        parseInt(draftPrize) || 0,
        parseInt(draftWinners) || 0,
      );
      toast.success('Insentif diperbarui');
      setEditing(null);
      onDataUpdated();
    } catch {
      toast.error('Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  const editButton = (section: EditSection) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[11px] text-gray-400 hover:text-blue-600"
      onClick={() => startEdit(section)}
    >
      <PenLine className="w-3 h-3 mr-1" /> Edit
    </Button>
  );

  const saveCancel = (onSave: () => void) => (
    <div className="flex items-center gap-2 pt-1.5">
      <Button
        size="sm"
        className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-3 text-xs text-gray-500"
        onClick={cancelEdit}
        disabled={saving}
      >
        Cancel
      </Button>
    </div>
  );

  return (
    <>
      {/* ── Submission ────────────────────────────────── */}
      <DetailSheetSection
        title="Submission"
        action={editing !== 'submission' ? editButton('submission') : undefined}
      >
        {editing === 'submission' ? (
          <div className="space-y-2.5 text-xs">
            <div className="space-y-1">
              <label className="text-gray-400 text-[11px]">Judul survey</label>
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Jumlah pertanyaan</label>
                <Input
                  type="number"
                  value={draftQuestions}
                  onChange={(e) => setDraftQuestions(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Durasi iklan (days)</label>
                <Input
                  type="number"
                  value={draftDuration}
                  onChange={(e) => setDraftDuration(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            {saveCancel(handleSaveSubmission)}
          </div>
        ) : (
          <div className="grid grid-cols-[120px_1fr] !gap-x-3 !gap-y-1.5 text-xs">
            <span className="text-gray-400">Judul survey</span>
            <span className="font-medium text-gray-900">{submission.formTitle}</span>
            <span className="text-gray-400">Submission ID</span>
            <span className="font-mono text-gray-900">#{submission.formId}</span>
            <span className="text-gray-400">Tanggal submission</span>
            <span className="font-medium text-gray-900">
              {new Date(submission.submittedAt).toLocaleDateString('id-ID')}{' '}
              {new Date(submission.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-gray-400">Jumlah pertanyaan</span>
            <span className="font-medium text-gray-900">{submission.questionCount} Qs</span>
            <span className="text-gray-400">Durasi iklan</span>
            <span className="font-medium text-gray-900">{submission.duration ? `${submission.duration} Days` : 'Belum diisi'}</span>
          </div>
        )}
      </DetailSheetSection>

      {/* ── Kriteria Responden ────────────────────────── */}
      <DetailSheetSection
        title="Kriteria Responden"
        action={editing !== 'criteria' ? editButton('criteria') : undefined}
      >
        {editing === 'criteria' ? (
          <div className="space-y-2.5">
            <Textarea
              value={draftCriteria}
              onChange={(e) => setDraftCriteria(e.target.value)}
              className="min-h-[80px] text-xs"
              placeholder="e.g. Usia 18-25 tahun, Mahasiswa aktif..."
            />
            {saveCancel(handleSaveCriteria)}
          </div>
        ) : submission.criteria ? (
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
            {submission.criteria}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic bg-gray-50 px-2.5 py-1.5 rounded border border-dashed border-gray-200">
            Target not set
          </p>
        )}
      </DetailSheetSection>

      {/* ── Insentif ─────────────────────────────────── */}
      <DetailSheetSection
        title="Insentif"
        action={editing !== 'incentive' ? editButton('incentive') : undefined}
      >
        {editing === 'incentive' ? (
          <div className="space-y-2.5 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Insentif per user (Rp)</label>
                <Input
                  type="number"
                  value={draftPrize}
                  onChange={(e) => setDraftPrize(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Jumlah user</label>
                <Input
                  type="number"
                  value={draftWinners}
                  onChange={(e) => setDraftWinners(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Total insentif</span>
                <span className="font-semibold text-emerald-600">
                  Rp {((parseInt(draftPrize) || 0) * (parseInt(draftWinners) || 0)).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
            {saveCancel(handleSaveIncentive)}
          </div>
        ) : submission.prize_per_winner ? (
          <div className="grid grid-cols-[120px_1fr] !gap-x-3 !gap-y-1.5 text-xs">
            <span className="text-gray-400">Insentif per user</span>
            <span className="font-medium text-gray-900">
              Rp {submission.prize_per_winner.toLocaleString('id-ID')}
            </span>

            <span className="text-gray-400">Jumlah user</span>
            <span className="font-medium text-gray-900">
              {submission.winnerCount || 0} user
            </span>

            <span className="text-gray-400">Total insentif</span>
            <span className="font-semibold text-emerald-600">
              Rp {((submission.prize_per_winner || 0) * (submission.winnerCount || 0)).toLocaleString('id-ID')}
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 italic">No incentive</p>
        )}
      </DetailSheetSection>

      {/* ── Researcher (read-only) ────────────────────── */}
      <DetailSheetSection title="Researcher">
        <div className="grid grid-cols-[120px_1fr] !gap-x-3 !gap-y-1.5 text-xs">
          <span className="text-gray-400">Nama</span>
          <span className="font-medium text-gray-900">{submission.researcherName}</span>

          {submission.education && (
            <>
              <span className="text-gray-400">Edukasi</span>
              <span className="font-medium text-gray-900 capitalize text-left">
                {submission.education.replace(/_/g, ' ')}
              </span>
            </>
          )}

          {submission.department && (
            <>
              <span className="text-gray-400">Jurusan</span>
              <span className="font-medium text-gray-900">{submission.department}</span>
            </>
          )}

          {submission.university && (
            <>
              <span className="text-gray-400">Universitas</span>
              <span className="font-medium text-gray-900">{submission.university}</span>
            </>
          )}

          {submission.leads && (
            <>
              <span className="text-gray-400">Lead</span>
              <span className="font-medium text-gray-900 capitalize">
                {submission.leads.replace(/_/g, ' ')}
              </span>
            </>
          )}

          {submission.phone_number && (
            <>
              <span className="text-gray-400">WhatsApp</span>
              <span className="font-medium text-gray-900">{submission.phone_number}</span>
            </>
          )}

          {submission.researcherEmail && (
            <>
              <span className="text-gray-400">Email</span>
              <span className="font-medium text-gray-900">{submission.researcherEmail}</span>
            </>
          )}
        </div>
      </DetailSheetSection>

      {/* ── Invoice (read-only) ───────────────────────── */}
      <DetailSheetSection title="Invoice">
        <div className="grid grid-cols-[120px_1fr] !gap-x-3 !gap-y-1.5 text-xs">
          <span className="text-gray-400">Nama Invoice</span>
          <span className="font-medium text-gray-900">{submission.invoiceName || 'Belum diisi'}</span>

          <span className="text-gray-400">Email</span>
          <span className="font-medium text-gray-900">{submission.invoiceEmail || 'Belum diisi'}</span>

          <span className="text-gray-400">Nomor HP</span>
          <span className="font-medium text-gray-900">{submission.invoicePhone || 'Belum diisi'}</span>
        </div>
      </DetailSheetSection>

      {/* ── Status ────────────────────────────────────── */}
      <DetailSheetSection title="Status Submission">
        <div className="flex items-center">
          <LifecycleChip submission={submission} lifecycle={lifecycle} />
        </div>
      </DetailSheetSection>
    </>
  );
}
