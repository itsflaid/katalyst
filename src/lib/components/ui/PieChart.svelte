<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Chart from "chart.js/auto";

  export let labels: string[];
  export let data: number[];
  export let colors: string[] = [
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
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
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

<div class="relative h-64 w-full">
  <canvas bind:this={canvasEl}></canvas>
</div>
