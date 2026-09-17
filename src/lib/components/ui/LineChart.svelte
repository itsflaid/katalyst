<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Chart from "chart.js/auto";

  export let labels: string[];
  export let datasets: { label: string; data: number[]; color: string }[];

  let canvasEl: HTMLCanvasElement;
  let chart: Chart;

  onMount(() => {
    chart = new Chart(canvasEl, {
      type: "line",
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: `${d.color}1A`, // ~10% alpha buat area fill
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: "top",
            align: "end",
            labels: {
              color: "#64748B",
              boxWidth: 10,
              usePointStyle: true,
              font: { family: "Plus Jakarta Sans" },
            },
          },
        },
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
