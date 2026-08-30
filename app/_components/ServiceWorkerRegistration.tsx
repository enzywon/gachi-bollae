"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // The app remains usable as a regular website if registration fails.
      });
    }
  }, []);

  return null;
}
