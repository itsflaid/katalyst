import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Port 1:1 dari lib/utils.ts versi Next (helper `cn` generik, gak nyentuh
// Prisma/Next sama sekali — jadi tetep valid dipakai di sini).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
