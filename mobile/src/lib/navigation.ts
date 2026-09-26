/**
 * Safe back navigation for expo-router.
 *
 * `router.back()` dispatches a `GO_BACK` action that throws a dev-only
 * "not handled by any navigator" error when the stack has no history
 * (deep link, cold start, or stack reset via `router.replace`).
 * Always prefer this helper over raw `router.back()`.
 */
interface BackCapableRouter {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: string) => void;
}

export function goBackOrReplace(router: BackCapableRouter, fallback: string): void {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // canGoBack itself can throw when no navigator is mounted yet
  }
  router.replace(fallback as any);
}
