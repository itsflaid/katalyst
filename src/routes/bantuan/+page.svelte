<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';

  const angka = [
    {
      t: 'Revenue (Omzet)',
      d: 'Total uang masuk dari penjualan, sebelum dikurangi apa pun. Dihitung: jumlah terjual × harga jual, dijumlahkan semua produk. Contoh: 10 kopi × Rp10.000 = Rp100.000.'
    },
    {
      t: 'Modal (HPP)',
      d: 'Total modal barang yang terjual. Dihitung: jumlah terjual × harga modal. Contoh: 10 kopi × Rp6.000 = Rp60.000.'
    },
    {
      t: 'Profit (Untung)',
      d: 'Sisa uang setelah omzet dikurangi modal: Revenue − Modal. Contoh: Rp100.000 − Rp60.000 = Rp40.000.'
    },
    {
      t: 'Margin',
      d: 'Berapa persen dari tiap rupiah omzet yang jadi untung. Dihitung: Profit ÷ Revenue × 100%. Contoh: Rp40.000 ÷ Rp100.000 = 40%. Margin 40% artinya tiap Rp10.000 penjualan, Rp4.000 jadi untung. Di bawah 15% dianggap tipis.'
    },
    {
      t: 'Rata-rata struk',
      d: 'Rata-rata belanja per struk: Revenue ÷ jumlah struk. Naik artinya pelanggan belanja lebih banyak tiap datang.'
    }
  ];

  const transaksi = [
    {
      t: 'Struk',
      d: 'Satu bukti transaksi. Satu struk bisa berisi beberapa jenis produk sekaligus.'
    },
    {
      t: 'Kasir',
      d: 'Nama staff/owner yang mencatat struk. Nama tetap tampil di riwayat walau akun staff-nya sudah dihapus.'
    },
    {
      t: 'Batalkan struk',
      d: 'Hapus satu struk utuh karena salah catat (khusus Owner). Stok yang tadi berkurang ikut dikembalikan. Tidak ada ubah angka diam-diam biar tercatat rapi.'
    },
    {
      t: 'Buat koreksi',
      d: 'Salin isi struk yang salah ke keranjang, betulkan jumlahnya, lalu catat sebagai struk baru yang benar.'
    }
  ];

  const stok = [
    {
      t: 'Stok',
      d: 'Sisa barang yang bisa dijual. Berkurang otomatis tiap ada penjualan, bertambah saat restock.'
    },
    {
      t: 'Restock',
      d: 'Tambah stok karena barang datang dari supplier (khusus Owner).'
    },
    {
      t: 'Koreksi / Opname',
      d: 'Sesuaikan angka stok dengan hitungan fisik barang di toko, wajib isi alasan (khusus Owner).'
    },
    {
      t: 'Habis & Menipis',
      d: 'Stok 0 ditandai Habis. Batas "menipis" bisa diatur per produk (default 5) lewat form tambah/edit — mis. barang mahal boleh batas 2, barang laris batas 10.'
    },
    {
      t: 'Habis = hilang dari kasir',
      d: 'Produk yang stoknya habis otomatis tidak muncul di kasir sampai direstock, tapi status Aktif/Nonaktif-nya tidak diubah. Nonaktif itu pilihan manual owner (mis. produk dihentikan/musiman).'
    },
    {
      t: 'Riwayat Stok',
      d: 'Tab khusus Owner di halaman Produk: semua pergerakan stok (penjualan, batal struk, restock, koreksi) lengkap dengan siapa dan kapan. Dashboard juga menampilkan kartu "Perlu restock" berisi produk yang stoknya menipis.'
    }
  ];

  const analisis = [
    {
      t: 'Baseline',
      d: 'Data penjualan asli yang jadi patokan perbandingan di Simulator dan Statistik.'
    },
    {
      t: 'Skenario (Simulator)',
      d: 'Percobaan "kalau harga diubah, apa yang terjadi" tanpa mengubah data asli. Geser tuasnya, hasilnya langsung terhitung.'
    },
    {
      t: 'Titik impas',
      d: 'Jumlah unit yang harus terjual pada skenario simulasi supaya untungnya sama dengan kondisi sekarang.'
    },
    {
      t: 'Diskon maks',
      d: 'Batas diskon terbesar sebelum tiap unit mulai merugi (harga efektif di bawah modal).'
    },
    {
      t: 'Tren & Delta',
      d: 'Tren = gerakan angka dari hari ke hari. Delta = selisih vs periode sebelumnya, misal +12,5% artinya naik 12,5%. "Baru" artinya periode lalu masih nol.'
    },
    {
      t: 'Insight',
      d: 'Temuan otomatis dari data, misal produk laris tapi margin tipis — cocok dinaikkan sedikit harganya.'
    }
  ];

  const sections = [
    { title: 'Keuangan', items: angka },
    { title: 'Transaksi', items: transaksi },
    { title: 'Stok', items: stok },
    { title: 'Analisis', items: analisis }
  ];

  const pages = [
    { t: 'Dashboard', d: 'Ringkasan kondisi bisnis: omzet, untung, margin, tren 30 hari, produk teratas, dan temuan otomatis.' },
    { t: 'Statistik', d: 'Laporan lengkap per periode (harian/mingguan/bulanan/custom): komposisi untung, margin per produk, dan hari tersibuk.' },
    { t: 'Produk', d: 'Daftar barang dagangan: harga modal, harga jual, margin, stok, dan batas menipis per produk. Stok habis otomatis hilang dari kasir (tanpa menonaktifkan). Tab Riwayat Stok mencatat semua pergerakan.' },
    { t: 'Transaksi', d: 'Kasir: catat penjualan multi-produk per struk, lihat riwayat per hari, batalkan struk yang salah catat.' },
    { t: 'Simulator', d: 'Lab percobaan: geser harga, diskon, modal, atau volume untuk lihat dampaknya sebelum benar-benar diterapkan.' },
    { t: 'Copilot', d: 'Asisten tanya-jawab soal performa bisnismu, jawabannya dihitung dari data transaksimu sendiri.' },
    { t: 'Pengaturan', d: 'Nama bisnis dan kelola staff: undang akun baru, kirim ulang undangan, reset password yang lupa, dan hapus (khusus Owner).' },
    { t: 'Akun', d: 'Profil kamu: ganti nama tampil dan password sendiri.' }
  ];
</script>

<PageHeader title="Bantuan" subtitle="Arti istilah yang dipakai di aplikasi — dengan bahasa yang mudah di pahami." />

<Card class="mb-4">
  <h2 class="text-headline-sm text-ink mb-2">Apa itu Katalyst?</h2>
  <p class="text-body-md text-muted">
    Katalyst adalah aplikasi kasir + laporan untuk UMKM kuliner. Setiap penjualan dicatat sebagai struk,
    lalu aplikasi menghitung otomatis omzet, modal, untung, dan margin — plus memberi tahu produk mana
    yang paling menguntungkan dan mana yang marginnya tipis. Semua angka dihitung langsung dari data
    transaksimu dengan rumus pasti; AI hanya membantu menjelaskan, tidak mengarang angka.
  </p>
</Card>

<Card class="mb-6">
  <h2 class="text-headline-sm text-ink mb-3">Fungsi tiap halaman</h2>
  <dl class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
    {#each pages as p}
      <div class="rounded border border-border-cool px-3 py-2.5">
        <dt class="text-body-md font-semibold text-ink">{p.t}</dt>
        <dd class="text-body-sm text-muted mt-0.5">{p.d}</dd>
      </div>
    {/each}
  </dl>
</Card>

<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
  {#each sections as s}
    <Card>
      <h2 class="text-headline-sm text-ink mb-3">{s.title}</h2>
      <dl class="flex flex-col gap-3">
        {#each s.items as it}
          <div class="rounded border border-border-cool px-3 py-2.5">
            <dt class="text-body-md font-semibold text-ink">{it.t}</dt>
            <dd class="text-body-sm text-muted mt-0.5">{it.d}</dd>
          </div>
        {/each}
      </dl>
    </Card>
  {/each}
</div>
