import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface PersonalDataWarningModalProps {
  detectedKeywords: string[];
  onContinue: () => void;
  onCancel: () => void;
}

export function PersonalDataWarningModal({
  detectedKeywords,
  onContinue,
  onCancel
}: PersonalDataWarningModalProps) {
  const { t } = useLanguage();

  return (
    <div className="modal-overlay" style={{
      zIndex: 9999,
      padding: '1rem',
      overflowY: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div className="modal-dialog" style={{
        maxWidth: '500px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        margin: 'auto'
      }}>
        {/* Header */}
        <div className="modal-header" style={{
          borderBottom: '2px solid #f59e0b',
          paddingBottom: '1rem',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', paddingRight: '2rem' }}>
            <div style={{
              padding: '0.5rem',
              backgroundColor: '#fef3c7',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <AlertTriangle size={20} color="#f59e0b" />
            </div>
            <div>
              <h3 className="modal-title" style={{
                color: '#f59e0b',
                marginBottom: '0.25rem',
                fontSize: '1rem',
                fontWeight: '600'
              }}>
                {t('personalDataWarningTitle')}
              </h3>
              <p style={{ fontSize: '0.813rem', color: '#78716c', margin: 0, lineHeight: '1.4' }}>
                {t('personalDataWarningSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            style={{
              position: 'absolute',
              right: '1rem',
              top: '1rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              color: '#9ca3af',
              lineHeight: 0
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          {/* Detected Keywords */}
          <div style={{
            backgroundColor: '#fef3c7',
            padding: '0.875rem',
            borderRadius: '0.5rem',
            marginBottom: '1.25rem',
            border: '1px solid #fbbf24'
          }}>
            <p style={{ fontSize: '0.813rem', fontWeight: '600', marginBottom: '0.5rem', color: '#92400e' }}>
              {t('personalDataDetectedLabel')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {detectedKeywords.map((keyword, index) => (
                <span
                  key={index}
                  style={{
                    backgroundColor: '#fed7aa',
                    color: '#92400e',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '500'
                  }}
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>

          {/* Warning Message - Simplified */}
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.875rem', lineHeight: '1.6', color: '#4b5563', marginBottom: '0.875rem' }}>
              {t('personalDataPolicyExplanation')}
            </p>
            <ul style={{
              fontSize: '0.813rem',
              lineHeight: '1.5',
              color: '#4b5563',
              paddingLeft: '1.25rem',
              margin: 0
            }}>
              <li>{t('personalDataExample1')}</li>
              <li>{t('personalDataExample2')}</li>
              <li>{t('personalDataExample3')}</li>
              <li>{t('personalDataExample4')}</li>
            </ul>
          </div>

          {/* What Happens - Simplified */}
          <div style={{
            backgroundColor: '#eff6ff',
            padding: '0.875rem',
            borderRadius: '0.5rem',
            border: '1px solid #93c5fd',
            marginBottom: '1rem'
          }}>
            <p style={{ fontSize: '0.813rem', fontWeight: '600', marginBottom: '0.5rem', color: '#1e40af' }}>
              {t('personalDataWhatHappens')}
            </p>
            <p style={{ fontSize: '0.813rem', lineHeight: '1.5', color: '#1e40af', margin: 0 }}>
              {t('personalDataWhatHappensDetail')}
            </p>
          </div>

          {/* Learn More Link */}
          <a
            href="https://jakpatforuniv.com/syarat-ketentuan"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.813rem',
              color: '#2563eb',
              textDecoration: 'none',
              fontWeight: '500'
            }}
          >
            {t('readTermsConditions')}
            <ExternalLink size={14} />
          </a>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.625rem',
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb'
        }}>
          <button
            onClick={onContinue}
            className="modal-button modal-button-confirm"
            style={{
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              backgroundColor: '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            {t('personalDataContinueButton')}
          </button>
          <button
            onClick={onCancel}
            className="modal-button modal-button-cancel"
            style={{
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              color: '#374151',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            {t('personalDataCancelButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
