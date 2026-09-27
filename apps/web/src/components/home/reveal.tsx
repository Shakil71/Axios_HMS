'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Fades content in as it scrolls into view. Content is fully visible on the server and for anyone without JavaScript or with
 * "reduce motion"; only elements that start below the fold are hidden after hydration and revealed once seen.
 */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'server' | 'hidden' | 'shown'>('server');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window) || el.getBoundingClientRect().top < window.innerHeight) {
      setState('shown');
      return;
    }
    setState('hidden');
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setState('shown');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: state === 'shown' ? `${delay}ms` : undefined }}
      className={`${className} ${state === 'hidden' ? 'translate-y-6 opacity-0' : 'translate-y-0 opacity-100'} transition duration-700 ease-out`}
    >
      {children}
    </div>
  );
}
