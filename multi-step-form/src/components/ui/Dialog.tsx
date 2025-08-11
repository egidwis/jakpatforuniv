import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface DialogContentProps {
  className?: string;
  children: React.ReactNode;
  onEscapeKeyDown?: () => void;
  onPointerDownOutside?: () => void;
  style?: React.CSSProperties;
}

interface DialogHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogCloseProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

// Main Dialog component
export const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        style={{
          zIndex: 9999,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          animation: open ? 'fadeIn 200ms ease-out' : 'fadeOut 200ms ease-in'
        }}
      />

      {/* Dialog Container */}
      <div
        className="fixed inset-0"
        style={{
          zIndex: 10000,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}
      >
        {children}
      </div>
    </>
  );
};

// Dialog Content
export const DialogContent: React.FC<DialogContentProps> = ({
  className = '',
  children,
  onEscapeKeyDown,
  onPointerDownOutside,
  style
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleOutsideClick = () => {
    onPointerDownOutside?.();
  };

  return (
    <div
      className={`
        bg-white rounded-xl shadow-2xl
        transform transition-all duration-200 ease-out
        ${className}
      `}
      style={{
        maxHeight: '90vh',
        overflowY: 'auto',
        animation: 'slideIn 200ms ease-out',
        pointerEvents: 'auto',
        backgroundColor: '#ffffff',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        position: 'relative',
        margin: '0',
        ...style
      }}
      onClick={handleClick}
    >
      {children}
    </div>
  );
};

// Dialog Header
export const DialogHeader: React.FC<DialogHeaderProps> = ({ children, className = '' }) => {
  return (
    <div className={`flex flex-col space-y-2 text-center sm:text-left ${className}`}>
      {children}
    </div>
  );
};

// Dialog Title
export const DialogTitle: React.FC<DialogTitleProps> = ({ children, className = '' }) => {
  return (
    <h2 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
      {children}
    </h2>
  );
};

// Dialog Description
export const DialogDescription: React.FC<DialogDescriptionProps> = ({ children, className = '' }) => {
  return (
    <p className={`text-sm text-gray-600 ${className}`}>
      {children}
    </p>
  );
};

// Dialog Footer
export const DialogFooter: React.FC<DialogFooterProps> = ({ children, className = '' }) => {
  return (
    <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className}`}>
      {children}
    </div>
  );
};

// Dialog Close Button
export const DialogClose: React.FC<DialogCloseProps> = ({
  children,
  className = '',
  onClick
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white
        transition-opacity hover:opacity-100 focus:outline-none
        focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        disabled:pointer-events-none
        ${className}
      `}
    >
      {children || <X className="h-4 w-4" />}
      <span className="sr-only">Close</span>
    </button>
  );
};

// Personal Data Warning Dialog - Specialized component
interface PersonalDataWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedKeywords: string[];
  onContinue: () => void;
}

export const PersonalDataWarningDialog: React.FC<PersonalDataWarningDialogProps> = ({
  open,
  onOpenChange,
  detectedKeywords,
  onContinue
}) => {
  const handleContinue = () => {
    onContinue();
    onOpenChange(false);
  };

  const handleContactJakpat = () => {
    const message = encodeURIComponent("Halo min jakpatforuniv, link form saya mengandung email dan nomor handphone, bisa dibantu tidak ya kak?");
    const whatsappUrl = `https://wa.me/6287759153120?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className=""
        style={{
          width: 'fit-content'
        }}
      >
        {/* Clean Header */}
        <div className="text-center pt-6 pb-4" style={{ paddingLeft: '24px', paddingRight: '24px' }}>
          <div style={{ width: 'fit-content', margin: '0 auto' }}>
            <h2
              className="text-lg font-semibold mb-3"
              style={{ color: '#111827' }}
            >
              Peringatan Data Personal
            </h2>
          </div>

          <div
            className="text-center leading-relaxed text-sm"
            style={{
              color: '#6B7280',
              lineHeight: '1.6',
              width: 'fit-content',
              margin: '0 auto'
            }}
          >
            Kami mendeteksi ada pertanyaan meminta email atau nomor HP.<br />
            Jakpat berkomitmen menjaga privasi responden, pertanyaan yang meminta data pribadi seperti nomor HP atau email tidak diperbolehkan<br />
            Mohon sesuaikan kuisioner Anda agar iklan dapat kami proses.
          </div>
        </div>

        {/* Action Buttons */}
        <div
          className="flex gap-3 pb-6"
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            display: 'flex',
            paddingLeft: '24px',
            paddingRight: '24px',
            width: 'fit-content',
            margin: '0 auto'
          }}
        >
          <button
            onClick={handleContinue}
            className="px-4 py-2.5 text-white rounded-lg font-medium transition-colors text-sm"
            style={{
              backgroundColor: '#111827',
              border: 'none',
              minWidth: '120px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#1F2937';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#111827';
            }}
          >
            Oke mengerti
          </button>

          <button
            onClick={handleContactJakpat}
            className="px-4 py-2.5 rounded-lg font-medium transition-colors text-sm"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #D1D5DB',
              color: '#374151',
              minWidth: '120px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#F9FAFB';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Hubungi tim Jakpat
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
