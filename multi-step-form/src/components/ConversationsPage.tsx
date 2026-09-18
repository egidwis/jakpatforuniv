import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
    getAllChatSessions, 
    getChatMessages, 
    resolveChatSession, 
    type ChatSession, 
    type ChatMessage 
} from '@/utils/supabase';
import { 
    MessageSquare, 
    User, 
    Calendar, 
    Loader2, 
    AlertCircle, 
    Sparkles, 
    Lightbulb, 
    HelpCircle, 
    CheckCircle2, 
    RotateCcw, 
    Search, 
    Tag
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type FilterType = 'all' | 'needs_attention' | 'request' | 'feedback' | 'faq' | 'resolved';

export function ConversationsPage() {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadSessions();
    }, []);

    const loadSessions = async () => {
        setIsLoading(true);
        const data = await getAllChatSessions();
        setSessions(data);
        setIsLoading(false);
    };

    const selectedSession = useMemo(() => {
        return sessions.find(s => s.id === selectedSessionId) || null;
    }, [sessions, selectedSessionId]);

    const handleSelectSession = async (sessionId: string) => {
        setSelectedSessionId(sessionId);
        setIsLoadingMessages(true);

        // Mark as read in local storage
        const now = Date.now();
        const prevRead = localStorage.getItem(`chat_viewed_${sessionId}`);

        if (!prevRead || parseInt(prevRead) < now) {
            localStorage.setItem(`chat_viewed_${sessionId}`, now.toString());
            window.dispatchEvent(new Event('chat-session-viewed'));
        }

        const msgs = await getChatMessages(sessionId);
        setMessages(msgs);
        setIsLoadingMessages(false);
    };

    const handleToggleResolve = async () => {
        if (!selectedSession) return;
        const newResolvedState = !selectedSession.is_resolved;
        setIsUpdatingStatus(true);
        try {
            await resolveChatSession(selectedSession.id, newResolvedState);
            // Update local sessions state
            setSessions(prev => prev.map(s => {
                if (s.id === selectedSession.id) {
                    return {
                        ...s,
                        is_resolved: newResolvedState,
                        resolved_at: newResolvedState ? new Date().toISOString() : null,
                        needs_attention: newResolvedState ? false : s.needs_attention
                    };
                }
                return s;
            }));
        } catch (error) {
            console.error('Failed to toggle session resolution status:', error);
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    // Filter counts
    const counts = useMemo(() => {
        return {
            all: sessions.length,
            needs_attention: sessions.filter(s => (s.needs_attention || s.tag === 'issue') && !s.is_resolved).length,
            request: sessions.filter(s => s.tag === 'request' && !s.is_resolved).length,
            feedback: sessions.filter(s => s.tag === 'feedback' && !s.is_resolved).length,
            faq: sessions.filter(s => s.tag === 'faq' && !s.is_resolved).length,
            resolved: sessions.filter(s => s.is_resolved).length
        };
    }, [sessions]);

    // Filtered & Searched sessions
    const filteredSessions = useMemo(() => {
        return sessions.filter(s => {
            // Filter match
            if (activeFilter === 'needs_attention') {
                if (s.is_resolved || (!s.needs_attention && s.tag !== 'issue')) return false;
            } else if (activeFilter === 'request') {
                if (s.is_resolved || s.tag !== 'request') return false;
            } else if (activeFilter === 'feedback') {
                if (s.is_resolved || s.tag !== 'feedback') return false;
            } else if (activeFilter === 'faq') {
                if (s.is_resolved || s.tag !== 'faq') return false;
            } else if (activeFilter === 'resolved') {
                if (!s.is_resolved) return false;
            }

            // Search match
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const emailMatch = s.user_email?.toLowerCase().includes(q);
                const snippetMatch = s.last_message_snippet?.toLowerCase().includes(q);
                const tagMatch = s.tag_label?.toLowerCase().includes(q);
                return emailMatch || snippetMatch || tagMatch;
            }

            return true;
        });
    }, [sessions, activeFilter, searchQuery]);

    const renderTagBadge = (session: ChatSession) => {
        if (session.is_resolved) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Selesai
                </span>
            );
        }

        if (session.tag === 'issue' || session.needs_attention) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                    <AlertCircle className="w-3 h-3 text-rose-600" />
                    {session.tag_label || 'Kendala'}
                </span>
            );
        }

        if (session.tag === 'request') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    {session.tag_label || 'Request'}
                </span>
            );
        }

        if (session.tag === 'feedback') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                    <Lightbulb className="w-3 h-3 text-purple-600" />
                    {session.tag_label || 'Saran'}
                </span>
            );
        }

        if (session.tag === 'faq') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    <HelpCircle className="w-3 h-3 text-blue-600" />
                    {session.tag_label || 'Pertanyaan'}
                </span>
            );
        }

        return null;
    };

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-4">
            {/* Sidebar List */}
            <Card className="w-2/5 flex flex-col overflow-hidden border-slate-200 shadow-sm">
                <CardHeader className="border-b bg-slate-50/80 px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800">
                            <MessageSquare className="w-5 h-5 text-indigo-600" />
                            Conversations ({sessions.length})
                        </CardTitle>
                        {counts.needs_attention > 0 && (
                            <span className="px-2 py-0.5 bg-rose-600 text-white text-xs font-bold rounded-full animate-bounce">
                                {counts.needs_attention} Butuh Perhatian
                            </span>
                        )}
                    </div>

                    {/* Search Input */}
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                            type="text"
                            placeholder="Cari email, pesan, atau tag..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                        />
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                        <button
                            onClick={() => setActiveFilter('all')}
                            className={`px-2.5 py-1 rounded-md whitespace-nowrap font-medium transition-all ${
                                activeFilter === 'all'
                                    ? 'bg-slate-800 text-white shadow-xs'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                        >
                            Semua ({counts.all})
                        </button>
                        <button
                            onClick={() => setActiveFilter('needs_attention')}
                            className={`px-2.5 py-1 rounded-md whitespace-nowrap font-medium transition-all flex items-center gap-1 ${
                                activeFilter === 'needs_attention'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200'
                            }`}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Kendala ({counts.needs_attention})
                        </button>
                        <button
                            onClick={() => setActiveFilter('request')}
                            className={`px-2.5 py-1 rounded-md whitespace-nowrap font-medium transition-all flex items-center gap-1 ${
                                activeFilter === 'request'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-white text-amber-700 hover:bg-amber-50 border border-amber-200'
                            }`}
                        >
                            <Sparkles className="w-3 h-3" />
                            Request ({counts.request})
                        </button>
                        <button
                            onClick={() => setActiveFilter('feedback')}
                            className={`px-2.5 py-1 rounded-md whitespace-nowrap font-medium transition-all flex items-center gap-1 ${
                                activeFilter === 'feedback'
                                    ? 'bg-purple-600 text-white shadow-xs'
                                    : 'bg-white text-purple-700 hover:bg-purple-50 border border-purple-200'
                            }`}
                        >
                            <Lightbulb className="w-3 h-3" />
                            Saran ({counts.feedback})
                        </button>
                        <button
                            onClick={() => setActiveFilter('faq')}
                            className={`px-2.5 py-1 rounded-md whitespace-nowrap font-medium transition-all flex items-center gap-1 ${
                                activeFilter === 'faq'
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'
                            }`}
                        >
                            FAQ ({counts.faq})
                        </button>
                        <button
                            onClick={() => setActiveFilter('resolved')}
                            className={`px-2.5 py-1 rounded-md whitespace-nowrap font-medium transition-all flex items-center gap-1 ${
                                activeFilter === 'resolved'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
                            }`}
                        >
                            <CheckCircle2 className="w-3 h-3" />
                            Selesai ({counts.resolved})
                        </button>
                    </div>
                </CardHeader>

                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-slate-100">
                    {isLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>
                    ) : filteredSessions.length === 0 ? (
                        <div className="text-center p-8 text-slate-400 text-xs">
                            Tidak ada percakapan pada filter ini.
                        </div>
                    ) : (
                        filteredSessions.map((session) => (
                            <div
                                key={session.id}
                                onClick={() => handleSelectSession(session.id)}
                                className={`
                                    p-3 rounded-lg cursor-pointer border transition-all text-left group
                                    ${selectedSessionId === session.id
                                        ? 'bg-indigo-50/70 border-indigo-200 shadow-sm'
                                        : 'hover:bg-slate-50 border-transparent hover:border-slate-200'
                                    }
                                `}
                            >
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                                            <User className="w-3.5 h-3.5 text-indigo-600" />
                                        </div>
                                        <p className="font-semibold text-xs text-slate-900 truncate">
                                            {session.user_email}
                                        </p>
                                    </div>
                                    <div className="shrink-0">
                                        {renderTagBadge(session)}
                                    </div>
                                </div>

                                {session.last_message_snippet && (
                                    <p className="text-[11px] text-slate-600 line-clamp-2 mb-1.5 pl-9 leading-relaxed">
                                        "{session.last_message_snippet}"
                                    </p>
                                )}

                                <div className="flex items-center justify-between text-[10px] text-slate-400 pl-9">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(session.last_message_at).toLocaleDateString('id-ID', {
                                            day: 'numeric',
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                    {session.is_resolved && (
                                        <span className="text-emerald-600 font-medium">Diselesaikan</span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {/* Chat Detail */}
            <Card className="flex-1 flex flex-col overflow-hidden border-slate-200 shadow-sm">
                <CardHeader className="border-b bg-slate-50/80 px-6 py-3.5">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base font-bold text-slate-800">
                                {selectedSession ? selectedSession.user_email : 'Pilih Percakapan'}
                            </CardTitle>
                            {selectedSession && (
                                <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                                    <span>Aktif terakhir: {new Date(selectedSession.last_message_at).toLocaleString('id-ID')}</span>
                                    {selectedSession.resolved_at && (
                                        <span>• Diselesaikan: {new Date(selectedSession.resolved_at).toLocaleString('id-ID')}</span>
                                    )}
                                </p>
                            )}
                        </div>

                        {selectedSession && (
                            <div className="flex items-center gap-3">
                                {renderTagBadge(selectedSession)}
                                <button
                                    onClick={handleToggleResolve}
                                    disabled={isUpdatingStatus}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                                        selectedSession.is_resolved
                                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow'
                                    }`}
                                >
                                    {isUpdatingStatus ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : selectedSession.is_resolved ? (
                                        <>
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            Buka Kembali
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Tandai Selesai
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                    {!selectedSessionId ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                                <MessageSquare className="w-8 h-8 text-slate-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">Pilih sesi percakapan untuk melihat riwayat pesan</p>
                            <p className="text-xs text-slate-400 mt-1">Gunakan filter tab di sebelah kiri untuk melihat pesan yang butuh perhatian.</p>
                        </div>
                    ) : isLoadingMessages ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-600" /></div>
                    ) : messages.length === 0 ? (
                        <div className="text-center p-8 text-slate-500 text-sm">Tidak ada riwayat pesan dalam percakapan ini.</div>
                    ) : (
                        <div className="space-y-4 max-w-3xl mx-auto">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`
                                        max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-xs
                                        ${msg.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-tr-sm'
                                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                                        }
                                    `}>
                                        <ReactMarkdown
                                            components={{
                                                p: (props) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                                                ul: (props) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                                                ol: (props) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                                                li: (props) => <li className="pl-1" {...props} />,
                                                strong: (props) => <span className="font-bold" {...props} />,
                                                a: (props) => <a className="underline hover:text-indigo-200 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>

                                        {/* Show CTAs if assistant provided them */}
                                        {msg.ctas && msg.ctas.length > 0 && (
                                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
                                                <div className="w-full text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5 flex items-center gap-1">
                                                    <Tag className="w-3 h-3 text-indigo-500" /> Suggested Actions Ditampilkan ke User:
                                                </div>
                                                {msg.ctas.map((cta, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
                                                    >
                                                        {cta.label}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <p className={`text-[10px] mt-1.5 flex items-center justify-end gap-1 ${msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400'}`}>
                                            {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
