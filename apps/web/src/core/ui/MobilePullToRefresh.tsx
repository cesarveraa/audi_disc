import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

type Props = {
  disabled?: boolean;
  onRefresh: () => Promise<void> | void;
};

const TRIGGER_DISTANCE = 74;

export function MobilePullToRefresh({ disabled = false, onRefresh }: Props) {
  const startYRef = useRef<number | null>(null);
  const [distance, setDistance] = useState(0);
  const [isRefreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (disabled || navigator.maxTouchPoints <= 0) {
      return undefined;
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (window.scrollY > 0 || isRefreshing) {
        startYRef.current = null;
        return;
      }
      startYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (startYRef.current === null) {
        return;
      }
      const currentY = event.touches[0]?.clientY ?? startYRef.current;
      const nextDistance = Math.max(0, Math.min(96, currentY - startYRef.current));
      setDistance(nextDistance);
      if (nextDistance > 12) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      const shouldRefresh = distance >= TRIGGER_DISTANCE;
      startYRef.current = null;
      setDistance(0);
      if (!shouldRefresh) {
        return;
      }

      setRefreshing(true);
      Promise.resolve(onRefresh()).finally(() => setRefreshing(false));
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [disabled, distance, isRefreshing, onRefresh]);

  if (disabled && !isRefreshing) {
    return null;
  }

  const visible = distance > 0 || isRefreshing;
  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-3 z-[80] flex justify-center transition-opacity"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden={!visible}
    >
      <div
        className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/95 px-4 py-2 text-sm font-bold text-gray-950 shadow-card backdrop-blur-xl"
        style={{ transform: `translateY(${Math.min(distance / 2, 32)}px)` }}
      >
        {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-audi-red" /> : <RefreshCw className="h-4 w-4 text-audi-red" />}
        {isRefreshing ? 'Actualizando inventario...' : distance >= TRIGGER_DISTANCE ? 'Suelta para actualizar' : 'Desliza para actualizar'}
      </div>
    </div>
  );
}
