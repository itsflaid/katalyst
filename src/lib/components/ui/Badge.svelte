<script lang="ts">
  import { cn } from '$lib/shared/utils';

  // Tone solid mengikuti gambar acuan: hijau, mustard,
  // merah, abu, dan navy untuk produk di keranjang.
  export let tone: 'positive' | 'warning' | 'negative' | 'neutral' | 'navy' = 'neutral';
  // sm untuk tampilan kompak (role, status, persentase); md untuk ukuran KPI dashboard.
  export let size: 'sm' | 'md' = 'md';
  let className = '';
  export { className as class };
</script>

<span
  class={cn(
    'inline-flex items-center whitespace-nowrap rounded-[10px] font-bold',
    size === 'md' && 'px-2.5 py-1 text-label-md',
    size === 'sm' && 'px-2 py-0.5 text-[10px] leading-[14px] tracking-wide',
    tone === 'positive' && 'bg-[#15803D] text-white',
    tone === 'warning' && 'bg-[#D4A000] text-white',
    tone === 'negative' && 'bg-[#B91C1C] text-white',
    tone === 'neutral' && 'bg-[#6B7280] text-white',
    tone === 'navy' && 'bg-ink-navy text-white',
    className
  )}
>
  <slot />
</span>
