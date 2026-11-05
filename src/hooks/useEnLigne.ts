import { useSyncExternalStore } from 'react';

const abonner = (fn: () => void) => {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
};

/** true si le navigateur indique être connecté au réseau. */
export const useEnLigne = (): boolean =>
  useSyncExternalStore(
    abonner,
    () => navigator.onLine,
    () => true,
  );
