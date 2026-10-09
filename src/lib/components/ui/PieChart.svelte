<script context="module" lang="ts">
  export const PIE_COLORS = [
    "#172554",
    "#16A34A",
    "#B45309",
    "#0284C7",
    "#7C3AED",
    "#DC2626",
    "#0891B2",
    "#65A30D",
    "#C026D3",
    "#EA580C"
  ];
</script>

<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Chart from "chart.js/auto";

  export let labels: string[];
  export let data: number[];
  export let colors: string[] = PIE_COLORS;
  export let showLegend = true;
  export let cutout = "62%";
  export let borderWidth = 2;
  export let heightClass = "h-64";

  let canvasEl: HTMLCanvasElement;
  let chart: Chart;

  onMount(() => {
    chart = new Chart(canvasEl, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: labels.map((_, i) => colors[i % colors.length]),
            borderColor: "#FFFFFF",
            borderWidth
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout,
        // Potongan donat mekar satu-satu (stagger 100ms).
        animation: {
          duration: 800,
          easing: 'easeOutQuart',
          animateRotate: true,
          animateScale: true,
          delay: (ctx: { dataIndex?: number }) => (ctx.dataIndex ?? 0) * 100
        },
        plugins: {
          legend: {
            display: showLegend,
            position: "right",
            labels: {
              color: "#64748B",
              boxWidth: 10,
              usePointStyle: true,
              font: { family: "Plus Jakarta Sans" }
            }
          }
        }
      }
    });
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="relative {heightClass} w-full">
  <canvas bind:this={canvasEl}></canvas>
</div>
