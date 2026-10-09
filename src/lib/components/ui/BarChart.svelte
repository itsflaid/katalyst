<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Chart from "chart.js/auto";

  export let labels: string[];
  export let data: number[] = [];
  export let color = "#172554";
  export let datasets: { label: string; data: number[]; color?: string }[] | undefined = undefined;
  export let colors: string[] | undefined = undefined;
  export let horizontal = false;
  export let stacked = false;
  export let yFormat: ((v: number) => string) | undefined = undefined;
  export let heightClass = "h-64";
  export let maxLabelChars = 16;
  export let showLegend: boolean | undefined = undefined;
  export let rounded: 'all' | 'edge' = 'all';
  export let tone: 'light' | 'navy' = 'light';

  let canvasEl: HTMLCanvasElement;
  let chart: Chart;

  const PALETTE = ["#172554", "#16A34A", "#0284C7", "#B45309", "#7C3AED", "#DC2626", "#64748B"];
  const DEFAULT_COLOR = "#172554";

  // Label kategori dipotong biar sumbu tidak meluber; tooltip tampilkan penuh.
  $: fullLabels = labels ?? [];
  $: shortLabels = fullLabels.map((l) =>
    l.length > maxLabelChars ? l.slice(0, maxLabelChars - 1) + "…" : l
  );

  onMount(() => {
    const resolved =
      datasets ??
      [{ label: "", data, color }];
    const valueAxis = horizontal ? "x" : "y";
    // Radius sisi tumbuh saja; stacked dan default tetap seperti lama.
    const edgeRadius = horizontal
      ? { topLeft: 0, topRight: 5, bottomLeft: 0, bottomRight: 5 }
      : { topLeft: 5, topRight: 5, bottomLeft: 0, bottomRight: 0 };
    const fallback = tone === "navy" && color === DEFAULT_COLOR ? "#FFFFFF" : color;
    const tickColor = tone === "navy" ? "#CBD5E1" : "#64748B";
    const gridColor = tone === "navy" ? "rgba(255,255,255,0.12)" : "#F1F5F9";
    chart = new Chart(canvasEl, {
      type: "bar",
      data: {
        labels: shortLabels,
        datasets: resolved.map((d, i) => ({
          label: d.label,
          data: d.data,
          backgroundColor:
            resolved.length === 1 ? (colors ?? d.color ?? fallback) : (d.color ?? PALETTE[i % PALETTE.length]),
          borderRadius: stacked || rounded === "all" ? 4 : edgeRadius,
          maxBarThickness: 36,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        // Bar tumbuh satu-satu (stagger 80ms) biar animasinya kelihatan.
        animation: {
          duration: 700,
          easing: 'easeOutQuart',
          delay: (ctx) => (ctx.dataIndex ?? 0) * 80
        },
        plugins: {
          legend: { display: showLegend ?? resolved.length > 1 },
          tooltip: {
            callbacks: {
              title: (items) => (items.length > 0 ? fullLabels[items[0].dataIndex] ?? "" : ""),
              label: (item) => {
                const v = Number(item.raw);
                const name = item.dataset.label ? `${item.dataset.label}: ` : "";
                return ` ${name}${yFormat ? yFormat(v) : v}`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked,
            grid: { display: false },
            ticks: {
              color: tickColor,
              font: { family: "Plus Jakarta Sans" },
              ...(valueAxis === "x" && yFormat
                ? { callback: function (v: string | number) { return yFormat(Number(v)); } as never }
                : {}),
            },
          },
          y: {
            stacked,
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: "Plus Jakarta Sans" },
              ...(valueAxis === "y" && yFormat
                ? { callback: function (v: string | number) { return yFormat(Number(v)); } as never }
                : {}),
            },
          },
        },
      },
    });
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="relative {heightClass} w-full">
  <canvas bind:this={canvasEl}></canvas>
</div>
