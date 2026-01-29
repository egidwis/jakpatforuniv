import { Info, X, ExternalLink, ShieldAlert } from 'lucide-react';
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
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)'
    }}>
      <div className="modal-dialog" style={{
        maxWidth: '550px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        margin: 'auto',
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Header */}
        <div className="modal-header" style={{
          borderBottom: '1px solid #e5e7eb',
          padding: '1.25rem 1.5rem',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{
            padding: '0.5rem',
            backgroundColor: '#eff6ff',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <ShieldAlert size={24} color="#3b82f6" />
          </div>
          <div>
            <h3 className="modal-title" style={{
              color: '#1e3a8a',
              marginBottom: '0.25rem',
              fontSize: '1.125rem',
              fontWeight: '600',
              lineHeight: '1.5'
            }}>
              {t('personalDataWarningTitle')}
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
              {t('personalDataWarningSubtitle')}
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            style={{
              position: 'absolute',
              right: '1.25rem',
              top: '1.25rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              color: '#9ca3af',
              lineHeight: 0,
              borderRadius: '0.375rem',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1.5rem' }}>

          {/* Detected Keywords - Clean Tags */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
              {t('personalDataDetectedLabel')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {detectedKeywords.map((keyword, index) => (
                <span
                  key={index}
                  style={{
                    backgroundColor: '#f3f4f6',
                    color: '#4b5563',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    border: '1px solid #e5e7eb',
                    textTransform: 'capitalize'
                  }}
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>


          {/* Educational Info - Blue Accent */}
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start',
            backgroundColor: '#eff6ff',
            padding: '1rem',
            borderRadius: '0.5rem',
            border: '1px solid #bfdbfe'
          }}>
            <Info size={20} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e40af' }}>
                {t('personalDataWhatHappens')}
              </p>
              <p style={{ fontSize: '0.813rem', lineHeight: '1.5', color: '#1e3a8a', margin: 0 }}>
                {t('personalDataWhatHappensDetail')}
              </p>
              <div style={{ marginTop: '0.75rem' }}>
                <a
                  href="https://jakpatforuniv.com/syarat-ketentuan"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.75rem',
                    color: '#2563eb',
                    textDecoration: 'none',
                    fontWeight: '600'
                  }}
                >
                  {t('readTermsConditions')}
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Actions (Primary is Edit) */}
        <div className="modal-footer" style={{
          display: 'flex',
          flexDirection: 'column-reverse', // To ensure primary is easily clickable or visually distinct
          gap: '0.75rem',
          padding: '1.25rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          borderBottomLeftRadius: '0.75rem',
          borderBottomRightRadius: '0.75rem'
        }}>
          {/* Secondary Action: Continue */}
          <button
            onClick={onContinue}
            className="modal-button-secondary"
            style={{
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              backgroundColor: 'transparent',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.color = '#374151';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            {t('personalDataContinueButton')}
          </button>

          {/* Primary Action: Go Back & Edit */}
          <button
            onClick={onCancel}
            className="modal-button-primary"
            style={{
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              width: '100%',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          >
            {t('personalDataCancelButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
