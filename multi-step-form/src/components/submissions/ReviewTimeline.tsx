import { ChevronDown, ChevronUp, History } from 'lucide-react';
import type { ReviewHistoryEntry } from './types';
import { cn } from '@/lib/utils';

interface ReviewTimelineProps {
  history: ReviewHistoryEntry[];
  isExpanded: boolean;
  onToggle: () => void;
}

export function ReviewTimeline({ history, isExpanded, onToggle }: ReviewTimelineProps) {
  if (!history || history.length === 0) return null;

  // Sort history to show newest first
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getStatusDetails = (action: ReviewHistoryEntry['action']) => {
    switch (action) {
      case 'approved':
        return {
          dotColor: 'bg-green-500 ring-green-100',
          textColor: 'text-green-700',
          bgColor: 'bg-green-50/50 border-green-100',
          label: 'Approved',
        };
      case 'rejected':
        return {
          dotColor: 'bg-red-500 ring-red-100',
          textColor: 'text-red-700',
          bgColor: 'bg-red-50/50 border-red-100',
          label: 'Rejected',
        };
      case 'spam':
        return {
          dotColor: 'bg-orange-500 ring-orange-100',
          textColor: 'text-orange-700',
          bgColor: 'bg-orange-50/50 border-orange-100',
          label: 'Spam',
        };
      case 'in_review':
      default:
        return {
          dotColor: 'bg-blue-500 ring-blue-100',
          textColor: 'text-blue-700',
          bgColor: 'bg-blue-50/50 border-blue-100',
          label: 'Need Review',
        };
    }
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const dateStr = date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dateStr}, ${timeStr}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
          <History className="w-3 h-3" />
          History Log
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-gray-500 hover:text-blue-600 hover:bg-gray-50 transition-colors"
        >
          {isExpanded ? (
            <>
              Hide History ({history.length})
              <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              Show History ({history.length})
              <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="relative pl-3 max-h-[150px] overflow-y-auto border-l border-gray-100 space-y-4 py-1 pr-1 scrollbar-thin">
          {sortedHistory.map((entry, idx) => {
            const details = getStatusDetails(entry.action);
            return (
              <div key={idx} className="relative group">
                {/* Timeline node dot */}
                <div
                  className={cn(
                    "absolute -left-[17px] top-1 h-2 w-2 rounded-full ring-4 bg-current shrink-0",
                    details.dotColor
                  )}
                />
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={cn("font-semibold", details.textColor)}>
                      {details.label}
                    </span>
                    <span className="text-gray-400">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                  {entry.notes && (
                    <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded px-2 py-1 leading-relaxed whitespace-pre-line italic">
                      "{entry.notes}"
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
