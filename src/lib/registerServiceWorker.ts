export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    !import.meta.env.PROD
    || typeof window === 'undefined'
    || !('serviceWorker' in navigator)
  ) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (error) {
    console.warn('Service worker registration failed; continuing without offline shell support.', error);
    return null;
  }
}
