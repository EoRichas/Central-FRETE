"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** A new notification restarts the timer, including repeated identical messages. */
export function useTransientMessage() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const notify = useCallback((value: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(value);
    timer.current = value ? setTimeout(() => { setMessage(null); timer.current = null; }, 3000) : null;
  }, []);
  return [message, notify] as const;
}
