export function isIOSSafariUninstalled(
  userAgent: string,
  navigatorStandalone: boolean | undefined,
  matchMediaStandalone: boolean
): boolean {
  const isIOS = /ipad|iphone|ipod/i.test(userAgent);
  if (!isIOS) return false;

  // It's standalone if either the iOS specific navigator.standalone is true,
  // or if matchMedia matches standalone.
  const isStandalone = navigatorStandalone || matchMediaStandalone;
  if (isStandalone) return false;

  // Is it Safari? 
  // Safari has "Safari" and doesn't have other browser markers like CriOS, FxiOS, etc.
  const isSafari = /safari/i.test(userAgent) && !/(crios|fxios|opios|edgios|chrome|chromium)/i.test(userAgent);

  return isSafari;
}
