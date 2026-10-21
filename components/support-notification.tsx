"use client";

import { useEffect, useState } from 'react';
import { loadSupportNotifications, supportMessageUnread, SUPPORT_READ_EVENT, type SupportNotification } from '@/lib/client/support-notifications';
import styles from './support-notification.module.css';

export function SupportNotification({userId}: {userId: string}) {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let running = false;
    let notifications: SupportNotification[] = [];
    const update = () => {
      if (!controller.signal.aborted) setUnread(notifications.some(item => supportMessageUnread(userId, item, {getItem: key => window.localStorage.getItem(key)})));
    };
    async function refresh() {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
        // Sup enforces UNIQUE(company,recipient). No other person's thread can
        // be listed by this signed bridge, and this read never marks it read.
        notifications = await loadSupportNotifications(signal); update();
      } catch { /* No alert is dismissed on transport failure; retry on the next visible poll. */ }
      finally { running = false; }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 5000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener(SUPPORT_READ_EVENT, update); window.addEventListener('storage', update);
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener(SUPPORT_READ_EVENT, update); window.removeEventListener('storage', update); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [userId]);
  return unread ? <span className={styles.badge} role="status" aria-label="Mensagem não lida do suporte" title="Você recebeu uma mensagem do suporte">!</span> : null;
}
