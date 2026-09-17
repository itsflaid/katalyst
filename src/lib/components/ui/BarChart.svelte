<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Chart from "chart.js/auto";

  export let labels: string[];
  export let data: number[];
  export let color = "#172554";

  let canvasEl: HTMLCanvasElement;
  let chart: Chart;

  onMount(() => {
    chart = new Chart(canvasEl, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: color,
            borderRadius: 4,
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#64748B", font: { family: "Plus Jakarta Sans" } },
          },
          y: {
            grid: { color: "#F1F5F9" },
            ticks: { color: "#64748B", font: { family: "Plus Jakarta Sans" } },
          },
        },
      },
    });
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="relative h-64 w-full">
  <canvas bind:this={canvasEl}></canvas>
</div>
