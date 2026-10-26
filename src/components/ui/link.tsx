import type { AnchorHTMLAttributes } from "react";

/**
 * Plain document link used instead of next/link throughout the app.
 *
 * KindSpring targets low-end Android phones on slow connections, where hydration can take
 * several seconds. We observed client-router navigations being dropped when a link was
 * tapped during hydration. A plain <a> is always handled by the browser, works without
 * JavaScript, and – with long-lived caching of JS chunks – costs little more than an RSC
 * fetch. `prefetch` is accepted for API compatibility and ignored.
 */
export default function Link({
  prefetch: _prefetch,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  return <a {...props} />;
}
