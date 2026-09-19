<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Chart from "chart.js/auto";
  import { goto } from "$app/navigation";

  export let points: { x: number; y: number; r: number; label: string; href?: string }[];
  export let xLabel = "";
  export let yLabel = "";
  export let xLine: number | undefined = undefined;
  export let yLine: number | undefined = undefined;
  export let yFormat: ((v: number) => string) | undefined = undefined;
  export let heightClass = "h-80";

  let canvasEl: HTMLCanvasElement;
  let chart: Chart;

  // Garis kuadran putus-putus digambar inline via plugin afterDraw
  // biar tidak perlu dependensi annotation plugin.
  const quadrantPlugin = {
    id: "quadrant-lines",
    afterDraw(c: Chart) {
      const { ctx, chartArea, scales } = c;
      const xScale = scales["x"];
      const yScale = scales["y"];
      if (!xScale || !yScale) return;
      ctx.save();
      ctx.strokeStyle = "#94A3B8";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1;
      if (xLine !== undefined) {
        const px = xScale.getPixelForValue(xLine);
        ctx.beginPath();
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();
      }
      if (yLine !== undefined) {
        const py = yScale.getPixelForValue(yLine);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, py);
        ctx.lineTo(chartArea.right, py);
        ctx.stroke();
      }
      ctx.restore();
    },
  };

  onMount(() => {
    chart = new Chart(canvasEl, {
      type: "bubble",
      data: {
        datasets: [
          {
            label: "",
            data: points.map((p) => ({ x: p.x, y: p.y, r: p.r })),
            backgroundColor: "#172554CC",
            hoverBackgroundColor: "#172554",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const p = points[item.dataIndex];
                if (!p) return "";
                const y = yFormat ? yFormat(p.y) : p.y;
                return ` ${p.label} · x: ${p.x}, y: ${y}`;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: !!xLabel, text: xLabel, color: "#64748B" },
            grid: { color: "#F1F5F9" },
            ticks: { color: "#64748B", font: { family: "Plus Jakarta Sans" } },
          },
          y: {
            title: { display: !!yLabel, text: yLabel, color: "#64748B" },
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
        onClick: (_e, elements) => {
          const href = elements.length > 0 ? points[elements[0].index]?.href : undefined;
          if (href) goto(href);
        },
      },
      plugins: [quadrantPlugin],
    });
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="relative {heightClass} w-full">
  <canvas bind:this={canvasEl}></canvas>
</div>
