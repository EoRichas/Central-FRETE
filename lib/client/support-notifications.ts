export const SUPPORT_READ_EVENT = 'central-support-read';
export type SupportMessageMarker = {id: string; author_label: string};
export type SupportNotification = {chatId: string; messageId: string};
const memory = new Map<string, string>();
const keyFor = (userId: string, chatId: string) => `cf-support-read:${encodeURIComponent(userId)}:${chatId}`;

export function latestIncomingMessage(messages: SupportMessageMarker[]): string | null {
  // The bridge labels the technical company account as Você; all other authors
  // in a direct conversation are the support staff. Own replies never notify.
  return messages.filter(message => message.author_label !== 'Você').at(-1)?.id ?? null;
}
export async function loadSupportNotifications(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<SupportNotification[]> {
  const options: RequestInit = {credentials: 'same-origin', cache: 'no-store', signal};
  const response = await fetcher('/api/suporte/chats', options);
  if (!response.ok) throw new Error('Não foi possível verificar as mensagens do suporte.');
  const list = await response.json() as {chats: {id: string}[]};
  const notifications: SupportNotification[] = [];
  for (const chat of list.chats) {
    const detailResponse = await fetcher(`/api/suporte/chats/${chat.id}`, options);
    if (detailResponse.status === 404) continue;
    if (!detailResponse.ok) throw new Error('Não foi possível verificar as mensagens do suporte.');
    const detail = await detailResponse.json() as {messages: SupportMessageMarker[]};
    const messageId = latestIncomingMessage(detail.messages);
    if (messageId) notifications.push({chatId: chat.id, messageId});
  }
  return notifications;
}
export function supportMessageUnread(userId: string, item: SupportNotification, storage: Pick<Storage, 'getItem'>): boolean {
  const key = keyFor(userId, item.chatId);
  let seen = memory.get(key);
  try { seen = storage.getItem(key) ?? seen; } catch { /* Session-memory acknowledgement works when storage is blocked. */ }
  return seen !== item.messageId;
}
export function markSupportRead(userId: string, chatId: string, messageId: string) {
  const key = keyFor(userId, chatId); memory.set(key, messageId);
  try { window.localStorage.setItem(key, messageId); } catch { /* Keep only opaque IDs in session memory. */ }
  window.dispatchEvent(new Event(SUPPORT_READ_EVENT));
}
