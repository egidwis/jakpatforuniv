import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAllChatSessions, getChatMessages, type ChatSession, type ChatMessage } from '@/utils/supabase';
import { MessageSquare, User, Calendar, Loader2 } from 'lucide-react';

export function ConversationsPage() {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);

    useEffect(() => {
        loadSessions();
    }, []);

    const loadSessions = async () => {
        setIsLoading(true);
        const data = await getAllChatSessions();
        setSessions(data);
        setIsLoading(false);
    };

    const handleSelectSession = async (sessionId: string) => {
        setSelectedSessionId(sessionId);
        setIsLoadingMessages(true);
        const msgs = await getChatMessages(sessionId);
        setMessages(msgs);
        setIsLoadingMessages(false);
    };

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-4">
            {/* Sidebar List */}
            <Card className="w-1/3 flex flex-col overflow-hidden">
                <CardHeader className="border-b bg-gray-50/50 py-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-blue-600" />
                        Conversations
                    </CardTitle>
                </CardHeader>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {isLoading ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin text-gray-400" /></div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center p-4 text-gray-500 text-sm">No conversations found.</div>
                    ) : (
                        sessions.map((session) => (
                            <div
                                key={session.id}
                                onClick={() => handleSelectSession(session.id)}
                                className={`
                                    p-3 rounded-lg cursor-pointer border transition-all text-left
                                    ${selectedSessionId === session.id
                                        ? 'bg-blue-50 border-blue-200 shadow-sm'
                                        : 'hover:bg-gray-50 border-transparent hover:border-gray-200'
                                    }
                                `}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                                        <User className="w-3 h-3 text-blue-600" />
                                    </div>
                                    <p className="font-medium text-sm truncate">{session.user_email}</p>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(session.last_message_at).toLocaleString('id-ID')}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {/* Chat Detail */}
            <Card className="flex-1 flex flex-col overflow-hidden">
                <CardHeader className="border-b bg-gray-50/50 py-4"> // Fixed unexpected token error possibility by keeping simple
                    <CardTitle className="text-lg">
                        {selectedSessionId ? 'Chat Transcript' : 'Select a Conversation'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-4 bg-gray-50/20">
                    {!selectedSessionId ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                            <p>Select a user from the list to view their chat history.</p>
                        </div>
                    ) : isLoadingMessages ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-600" /></div>
                    ) : messages.length === 0 ? (
                        <div className="text-center p-4 text-gray-500">No messages in this conversation.</div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`
                                        max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm
                                        ${msg.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-tr-sm'
                                            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                                        }
                                    `}>
                                        <p>{msg.content}</p>
                                        <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                                            {new Date(msg.created_at).toLocaleTimeString('id-ID')}
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
