<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Chart from "chart.js/auto";

  export let labels: string[];
  export let datasets: { label: string; data: (number | null)[]; color: string }[];
  export let spanGaps = false;
  export let yFormat: ((v: number) => string) | undefined = undefined;
  export let heightClass = "h-64";

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
          spanGaps,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Animasi entrance tiap chart dibuat (tiap masuk halaman / ganti filter):
        // garis kedua menyusul 200ms biar terasa hidup.
        animation: {
          duration: 900,
          easing: 'easeOutQuart',
          delay: (ctx) => (ctx.datasetIndex ?? 0) * 200
        },
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
          tooltip: {
            callbacks: {
              label: (item) => {
                const v = item.parsed.y;
                if (v === null || v === undefined) return ` ${item.dataset.label}: —`;
                return ` ${item.dataset.label}: ${yFormat ? yFormat(Number(v)) : v}`;
              },
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
            ticks: {
              color: "#64748B",
              font: { family: "Plus Jakarta Sans" },
              ...(yFormat
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
