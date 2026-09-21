import { describe, it, expect } from 'vitest';
import { getSurveyEmbedInfo } from './surveyEmbed';

describe('getSurveyEmbedInfo', () => {
  it('returns false for empty or null URLs', () => {
    expect(getSurveyEmbedInfo('')).toEqual({
      isEmbeddable: false,
      embedUrl: '',
      originalUrl: '',
      reason: expect.any(String),
    });

    expect(getSurveyEmbedInfo(null)).toEqual({
      isEmbeddable: false,
      embedUrl: '',
      originalUrl: '',
      reason: expect.any(String),
    });

    expect(getSurveyEmbedInfo('   ')).toEqual({
      isEmbeddable: false,
      embedUrl: '',
      originalUrl: '',
      reason: expect.any(String),
    });
  });

  describe('Google Forms', () => {
    it('allows forms.gle shortlinks as embeddable', () => {
      const url = 'https://forms.gle/YeoTFV7CfsJ2pwPT6';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(true);
      expect(info.embedUrl).toBe(url);
    });

    it('allows docs.google.com/forms viewform and appends embedded=true', () => {
      const url = 'https://docs.google.com/forms/d/1bd-Zc590lg8I1o68z3HldD0AIZP5NMzPf8pVNOrZCgo/viewform';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(true);
      expect(info.embedUrl).toContain('embedded=true');
      expect(info.embedUrl).toBe('https://docs.google.com/forms/d/1bd-Zc590lg8I1o68z3HldD0AIZP5NMzPf8pVNOrZCgo/viewform?embedded=true');
    });

    it('preserves existing embedded=true without duplication', () => {
      const url = 'https://docs.google.com/forms/d/e/1FAIpQLSfFYnEZaXTdBrTrzzIFolmsLeSmpXASrRUU_zaNRfyr1kGpgQ/viewform?embedded=true';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(true);
      const occurrences = (info.embedUrl.match(/embedded=true/g) || []).length;
      expect(occurrences).toBe(1);
    });

    it('preserves other query parameters when adding embedded=true', () => {
      const url = 'https://docs.google.com/forms/d/e/123/viewform?usp=sf_link';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(true);
      expect(info.embedUrl).toContain('usp=sf_link');
      expect(info.embedUrl).toContain('embedded=true');
    });

    it('rejects /edit Google Forms URLs as editor links', () => {
      const url = 'https://docs.google.com/forms/d/1bd-Zc590lg8I1o68z3HldD0AIZP5NMzPf8pVNOrZCgo/edit';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(false);
      expect(info.isEditorUrl).toBe(true);
      expect(info.reason).toContain('editor');
    });

    it('rejects URLs with edit_requested=true', () => {
      const url = 'https://docs.google.com/forms/d/1bd-Zc590lg8I1o68z3HldD0AIZP5NMzPf8pVNOrZCgo/viewform?edit_requested=true';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(false);
      expect(info.isEditorUrl).toBe(true);
    });
  });

  describe('Non-Forms Google services', () => {
    it('rejects Google Drive URLs', () => {
      const info = getSurveyEmbedInfo('https://drive.google.com/drive/folders/123xyz');
      expect(info.isEmbeddable).toBe(false);
      expect(info.reason).toContain('Drive');
    });

    it('rejects Google Docs documents', () => {
      const info = getSurveyEmbedInfo('https://docs.google.com/document/d/123xyz/edit');
      expect(info.isEmbeddable).toBe(false);
      expect(info.reason).toContain('Drive/Docs');
    });

    it('rejects Google Sheets spreadsheets', () => {
      const info = getSurveyEmbedInfo('https://docs.google.com/spreadsheets/d/123xyz/edit');
      expect(info.isEmbeddable).toBe(false);
      expect(info.reason).toContain('Drive/Docs');
    });
  });

  describe('Known blocked platforms', () => {
    it('rejects social media URLs', () => {
      expect(getSurveyEmbedInfo('https://www.instagram.com/p/xyz').isEmbeddable).toBe(false);
      expect(getSurveyEmbedInfo('https://facebook.com/post/xyz').isEmbeddable).toBe(false);
      expect(getSurveyEmbedInfo('https://x.com/survey/123').isEmbeddable).toBe(false);
    });
  });

  describe('Other Survey Platforms & Campus Domains', () => {
    it('allows Microsoft Forms', () => {
      const url = 'https://forms.office.com/r/jDu0QiaC5g';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(true);
      expect(info.embedUrl).toBe(url);
    });

    it('allows Tally forms', () => {
      const url = 'https://tally.so/r/wz123';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(true);
      expect(info.embedUrl).toBe(url);
    });

    it('allows Typeform', () => {
      const url = 'https://form.typeform.com/to/xyz123';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(true);
      expect(info.embedUrl).toBe(url);
    });

    it('allows campus domains (*.ac.id)', () => {
      const url = 'https://kuesioner.ugm.ac.id/survei-mahasiswa-2026';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(true);
      expect(info.embedUrl).toBe(url);
    });

    it('auto-prepends https:// if missing', () => {
      const url = 'forms.gle/YeoTFV7CfsJ2pwPT6';
      const info = getSurveyEmbedInfo(url);
      expect(info.isEmbeddable).toBe(true);
      expect(info.embedUrl).toBe('https://forms.gle/YeoTFV7CfsJ2pwPT6');
    });
  });
});
