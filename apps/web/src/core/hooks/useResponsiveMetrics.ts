import { useEffect, useState } from 'react';

export type SizeClass = 'compact' | 'medium' | 'expanded';

function getSizeClass(width: number): SizeClass {
  if (width < 720) {
    return 'compact';
  }
  if (width < 1120) {
    return 'medium';
  }
  return 'expanded';
}

export function useResponsiveMetrics() {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const sizeClass = getSizeClass(width);
  return {
    width,
    sizeClass,
    isCompact: sizeClass === 'compact',
    isMedium: sizeClass === 'medium',
    isExpanded: sizeClass === 'expanded',
  };
}

