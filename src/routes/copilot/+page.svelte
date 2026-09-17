<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';

  const histories = [
    { title: 'Produk paling laku minggu ini', time: 'Hari ini', active: true },
    { title: 'Kenapa profit Americano kecil?', time: 'Hari ini', active: false },
    { title: 'Promo akhir bulan', time: 'Kemarin', active: false },
    { title: 'Harga jual Matcha Latte', time: 'Senin', active: false },
    { title: 'Stok biji kopi minggu depan', time: 'Minggu lalu', active: false }
  ];

  const suggestions = [
    'Tanya tentang profit tertinggi',
    'Tanya tentang margin terbesar',
    'Tanya tentang produk paling laku',
    'Tanya tentang performa penjualan'
  ];
</script>

<!-- FULL VIEWPORT -->
<div
  class="
    flex -m-8
    h-screen
    min-h-[560px]
    overflow-hidden
    bg-[#F7F1E6]
  "
>

  <!-- HISTORY -->
  <aside
    class="
      hidden lg:flex
      w-72 shrink-0
      flex-col
      border-r border-border-warm
      bg-[#F7F1E6]
    "
  >

    <!-- HISTORY HEADER -->
    <div class="px-5 pt-5 pb-4">

      <h2 class="text-headline-sm text-ink">
        Katalyst Copilot
      </h2>

      <p class="mt-1 text-body-sm text-muted">
        Riwayat percakapan
      </p>

    </div>


    <!-- HISTORY LIST -->
    <div class="flex-1 overflow-y-auto scroll-cream px-3">

      <div class="flex flex-col gap-1">

        {#each histories as h}

          <button
            type="button"
            class="
              group w-full
              border-l-2
              px-3 py-3
              text-left
              transition-colors
              {h.active
                ? 'border-ink-navy bg-black/[0.045]'
                : 'border-transparent hover:border-border-warm hover:bg-black/[0.025]'}
            "
          >

            <div class="flex items-center gap-3">

              <div class="min-w-0 flex-1">

                <p
                  class="
                    truncate
                    text-body-sm
                    leading-snug
                    {h.active
                      ? 'font-medium text-ink'
                      : 'text-ink/80'}
                  "
                >
                  {h.title}
                </p>

                <p class="mt-1 text-[11px] leading-none text-muted/70">
                  {h.time}
                </p>

              </div>


              <!-- CHEVRON -->
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="
                  shrink-0
                  text-muted/40
                  transition-transform
                  group-hover:translate-x-0.5
                  group-hover:text-ink/60
                "
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>

            </div>

          </button>

        {/each}

      </div>

    </div>


    <!-- HISTORY FOOTER -->
    <div class="border-t border-border-warm px-5 py-4">

      <p class="text-[11px] leading-none text-muted/70">
        5 percakapan terakhir
      </p>

    </div>

  </aside>


  <!-- CHAT -->
  <section
    class="
      flex
      min-w-0
      flex-1
      flex-col
      bg-ink-navy
    "
  >

    <!-- MESSAGES -->
    <div class="min-h-0 flex-1 overflow-y-auto scroll-navy">

      <div class="w-full px-4 py-5 sm:px-6">

        <div class="flex flex-col gap-7">


          <!-- STARTER CARD -->
          <div class="w-full">

            <div
              class="
                border
                border-white/10
                bg-white/[0.06]
                px-5 py-4
              "
            >

              <div class="flex items-start gap-3">

                <!-- KATALYST ICON -->
                <div
                  class="
                    flex
                    h-8 w-8
                    shrink-0
                    items-center
                    justify-center
                    border border-white/15
                    text-sm
                    font-semibold
                    text-white
                  "
                >
                  K
                </div>


                <div class="min-w-0">

                  <p class="text-body-md font-medium text-white">
                    Mau menganalisis apa hari ini?
                  </p>

                  <p class="mt-1 text-body-sm leading-relaxed text-white/50">
                    Katalyst dapat membantu membaca data bisnis dan menemukan
                    insight dari penjualan, profit, margin, dan produk.
                  </p>

                </div>

              </div>


              <!-- SUGGESTIONS -->
              <div class="mt-4 grid gap-2 sm:grid-cols-2">

                {#each suggestions as suggestion}

                  <button
                    type="button"
                    class="
                      flex
                      items-center
                      justify-between
                      border border-white/10
                      px-3 py-2.5
                      text-left
                      transition-colors
                      hover:bg-white/[0.06]
                    "
                  >

                    <span class="text-body-sm text-white/70">
                      {suggestion}
                    </span>

                    <span class="ml-3 text-white/30">
                      →
                    </span>

                  </button>

                {/each}

              </div>

            </div>

          </div>


          <!-- USER MESSAGE 1 -->
          <div class="flex justify-end">

            <div
              class="
                w-full
                max-w-[82%]
                sm:max-w-[72%]
                lg:max-w-[68%]
              "
            >

              <div class="flex justify-end">

                <div
                  class="
                    rounded-panel
                    rounded-br-sm
                    bg-status-positive
                    px-4 py-3
                  "
                >

                  <p class="text-body-md leading-relaxed text-white">
                    Produk apa yang paling laku minggu ini?
                  </p>

                </div>

              </div>

            </div>

          </div>


          <!-- AI RESPONSE 1 -->
          <div class="flex">

            <div
              class="
                w-full
                max-w-[88%]
                sm:max-w-[78%]
                lg:max-w-[72%]
              "
            >

              <div class="flex gap-3">

                <!-- AI AVATAR -->
                <div
                  class="
                    mt-1
                    flex
                    h-7 w-7
                    shrink-0
                    items-center
                    justify-center
                    border border-white/15
                    text-caption
                    font-semibold
                    text-white
                  "
                >
                  K
                </div>


                <!-- AI BUBBLE -->
                <div
                  class="
                    min-w-0
                    border
                    border-[#E5DCCB]
                    bg-[#F7F1E6]
                    rounded-tl-panel
                    rounded-tr-panel
                    rounded-br-panel
                    px-4 py-4
                  "
                >

                  <p
                    class="
                      text-body-md
                      leading-relaxed
                      text-[#30343B]
                    "
                  >
                    Berdasarkan penjualan 7 hari terakhir, berikut 3 produk
                    dengan volume penjualan tertinggi.
                  </p>


                  <!-- PRODUCT LIST -->
                  <div
                    class="
                      mt-4
                      divide-y divide-[#DED4C3]
                      border-y border-[#DED4C3]
                    "
                  >

                    <!-- PRODUCT 1 -->
                    <div
                      class="
                        flex
                        items-center
                        justify-between
                        gap-4
                        py-3
                      "
                    >

                      <div>

                        <p class="text-body-md text-[#20242A]">
                          Kopi Susu Gula Aren
                        </p>

                        <p class="text-caption text-[#7A756B]">
                          Produk terlaris
                        </p>

                      </div>

                      <span
                        class="
                          whitespace-nowrap
                          tabular
                          text-body-sm
                          text-[#57534B]
                        "
                      >
                        132 cup
                      </span>

                    </div>


                    <!-- PRODUCT 2 -->
                    <div
                      class="
                        flex
                        items-center
                        justify-between
                        gap-4
                        py-3
                      "
                    >

                      <div>

                        <p class="text-body-md text-[#20242A]">
                          Americano
                        </p>

                        <p class="text-caption text-[#7A756B]">
                          Volume tinggi
                        </p>

                      </div>

                      <span
                        class="
                          whitespace-nowrap
                          tabular
                          text-body-sm
                          text-[#57534B]
                        "
                      >
                        98 cup
                      </span>

                    </div>


                    <!-- PRODUCT 3 -->
                    <div
                      class="
                        flex
                        items-center
                        justify-between
                        gap-4
                        py-3
                      "
                    >

                      <div>

                        <p class="text-body-md text-[#20242A]">
                          Matcha Latte
                        </p>

                        <p class="text-caption text-[#7A756B]">
                          Volume stabil
                        </p>

                      </div>

                      <span
                        class="
                          whitespace-nowrap
                          tabular
                          text-body-sm
                          text-[#57534B]
                        "
                      >
                        61 cup
                      </span>

                    </div>

                  </div>


                  <!-- INSIGHT -->
                  <div class="mt-4 flex flex-wrap items-center gap-2">

                    <Badge tone="positive">
                      popular_low_margin
                    </Badge>

                    <p class="text-body-sm text-[#68635A]">
                      Americano laris, tetapi marginnya berada di bawah rata-rata.
                    </p>

                  </div>

                </div>

              </div>

            </div>

          </div>


          <!-- USER MESSAGE 2 -->
          <div class="flex justify-end">

            <div
              class="
                w-full
                max-w-[82%]
                sm:max-w-[72%]
                lg:max-w-[68%]
              "
            >

              <div class="flex justify-end">

                <div
                  class="
                    rounded-panel
                    rounded-br-sm
                    bg-status-positive
                    px-4 py-3
                  "
                >

                  <p class="text-body-md leading-relaxed text-white">
                    Kenapa profit Americano kecil padahal laris?
                  </p>

                </div>

              </div>

            </div>

          </div>


          <!-- AI RESPONSE 2 -->
          <div class="flex">

            <div
              class="
                w-full
                max-w-[88%]
                sm:max-w-[78%]
                lg:max-w-[72%]
              "
            >

              <div class="flex gap-3">

                <!-- AI AVATAR -->
                <div
                  class="
                    mt-1
                    flex
                    h-7 w-7
                    shrink-0
                    items-center
                    justify-center
                    border border-white/15
                    text-caption
                    font-semibold
                    text-white
                  "
                >
                  K
                </div>


                <!-- AI BUBBLE -->
                <div
                  class="
                    min-w-0
                    border
                    border-[#E5DCCB]
                    bg-[#F7F1E6]
                    rounded-tl-panel
                    rounded-tr-panel
                    rounded-br-panel
                    px-4 py-4
                  "
                >

                  <p class="mb-3 text-body-sm font-medium text-[#172033]">
                    Katalyst
                  </p>


                  <p
                    class="
                      text-body-md
                      leading-relaxed
                      text-[#30343B]
                    "
                  >
                    Americano terjual
                    <strong class="text-[#172033]">98 cup</strong>,
                    tetapi marginnya hanya
                    <strong class="text-[#172033]">18%</strong>.
                    Rata-rata margin bisnis saat ini berada di sekitar
                    <strong class="text-[#172033]">35%</strong>.
                  </p>


                  <!-- CAUSE -->
                  <div
                    class="
                      mt-4
                      border-y border-[#DED4C3]
                      py-4
                    "
                  >

                    <p
                      class="
                        mb-3
                        text-[11px]
                        uppercase
                        tracking-[0.12em]
                        text-[#8A8478]
                      "
                    >
                      Faktor utama
                    </p>


                    <div class="flex items-start gap-3">

                      <span
                        class="
                          mt-1.5
                          h-1.5 w-1.5
                          shrink-0
                          bg-status-warning
                        "
                      ></span>


                      <div>

                        <p class="text-body-sm text-[#292C31]">
                          Harga biji kopi meningkat 12%
                        </p>

                        <p
                          class="
                            mt-1
                            text-caption
                            leading-relaxed
                            text-[#777167]
                          "
                        >
                          Harga jual Americano belum berubah mengikuti kenaikan
                          biaya bahan baku.
                        </p>

                      </div>

                    </div>

                  </div>


                  <!-- RECOMMENDATION -->
                  <div class="mt-4 flex flex-wrap items-center gap-2">

                    <Badge tone="warning">
                      high_revenue_low_profit
                    </Badge>

                    <p class="text-body-sm text-[#68635A]">
                      Simulasi: naikkan harga Rp1.000 atau evaluasi supplier.
                    </p>

                  </div>

                </div>

              </div>

            </div>

          </div>


        </div>

      </div>

    </div>


    <!-- INPUT -->
    <div class="shrink-0 border-t border-white/10">

      <div class="w-full px-4 py-4 sm:px-6">

        <div
          class="
            flex
            items-center
            gap-2
            border border-white/15
            bg-white/[0.06]
            p-1.5
          "
        >

          <input
            type="text"
            disabled
            placeholder="Tanyakan sesuatu tentang bisnis Anda..."
            class="
              min-w-0
              flex-1
              bg-transparent
              px-3 py-2
              text-body-md
              text-white
              placeholder:text-white/30
              outline-none
            "
          />

          <!-- SEND (lucide send, inline karena paket lucide-svelte di-uninstall) -->
          <button
            type="button"
            disabled
            aria-label="Kirim"
            class="
              grid
              h-9 w-9
              shrink-0
              place-items-center
              rounded-panel
              bg-status-positive
              text-white
              transition-all
              hover:bg-status-positive/90
              disabled:opacity-60
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
              <path d="m21 21-5.211-5.189" />
            </svg>
          </button>

        </div>

      </div>

    </div>

  </section>

</div>

<style>
  /* Scrollbar ramping 6px selaras tema — Firefox + Chromium */
  .scroll-navy {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
  }
  .scroll-navy::-webkit-scrollbar {
    width: 6px;
  }
  .scroll-navy::-webkit-scrollbar-track {
    background: transparent;
  }
  .scroll-navy::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.25);
    border-radius: 9999px;
  }
  .scroll-navy::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.4);
  }
  .scroll-cream {
    scrollbar-width: thin;
    scrollbar-color: #e6e0d4 transparent;
  }
  .scroll-cream::-webkit-scrollbar {
    width: 6px;
  }
  .scroll-cream::-webkit-scrollbar-track {
    background: transparent;
  }
  .scroll-cream::-webkit-scrollbar-thumb {
    background: #e6e0d4;
    border-radius: 9999px;
  }
  .scroll-cream::-webkit-scrollbar-thumb:hover {
    background: #d4cbb8;
  }
</style>
