import { useEffect, useState } from 'react';

export interface ConnectivityState {
  readonly isOnline: boolean;
  readonly isOffline: boolean;
}

function readOnlineStatus(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function useConnectivity(): ConnectivityState {
  const [isOnline, setIsOnline] = useState<boolean>(readOnlineStatus);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, isOffline: !isOnline };
}
