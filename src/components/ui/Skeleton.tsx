import React from 'react';
import { cn } from '@/src/lib/utils';

export const Skeleton = ({ className }: { className?: string }) => {
  return (
    <div className={cn("animate-pulse bg-neutral-800/50 rounded-lg", className)} />
  );
};
