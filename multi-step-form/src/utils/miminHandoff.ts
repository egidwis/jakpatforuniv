export const HANDOFF_STAFF_EMAIL = 'product@jakpat.net';

export type ChatReplyMode = 'ai' | 'human';

export function normalizeReplyMode(value: unknown): ChatReplyMode {
  return value === 'human' ? 'human' : 'ai';
}

type HistoryMessage = {
  role: 'user' | 'assistant' | 'admin' | string;
  content: string;
};

/** Riwayat ke model: pesan admin jadi giliran user yang sudah dijawab manusia. */
export function toModelHistory(messages: HistoryMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages.map((message) => {
    if (message.role === 'admin') {
      return {
        role: 'user' as const,
        content: `[Pesan dari Tim Jakpat — sudah disampaikan ke peneliti. Jangan diulang, jangan ditimpa, jangan mengaku sebagai penulisnya.]\n${message.content}`,
      };
    }
    if (message.role === 'assistant') {
      return { role: 'assistant' as const, content: message.content };
    }
    return { role: 'user' as const, content: message.content };
  });
}

type Mergeable = {
  id?: string;
  role: string;
  content: string;
};

/** Realtime dan kirim lokal jangan menggandakan baris yang sama. */
export function mergeIncomingMessage<T extends Mergeable>(prev: T[], incoming: T): T[] {
  if (incoming.id && prev.some((message) => message.id === incoming.id)) return prev;
  const pending = prev.findIndex(
    (message) => !message.id && message.role === incoming.role && message.content === incoming.content
  );
  if (pending >= 0) {
    const next = prev.slice();
    next[pending] = { ...next[pending], ...incoming };
    return next;
  }
  return [...prev, incoming];
}
