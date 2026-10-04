const cases = [
  ['E01', 'Omzet minggu ini berapa?', 'get_summary'],
  ['E02', 'Untung bulan ini gimana?', 'get_summary'],
  ['E03', 'Produk paling laku?', 'rank_products'],
  ['E04', 'Margin terbesar?', 'rank_products'],
  ['E05', 'Bandingin bulan ini sama bulan lalu', 'compare_periods'],
  ['E06', 'Kenapa profit turun?', 'explain_change'],
  ['E07', 'Kalau harga Bolu Cinta naik 2 ribu gimana?', 'simulate_price'],
  ['E08', 'Stok apa yang menipis?', 'get_inventory'],
  ['E09', 'Harga biji kopi naik berapa?', 'no_tool'],
  ['E10', 'Prediksi omzet bulan depan?', 'no_tool'],
  ['E11', 'Ubah harga Bolu Cinta jadi 40 ribu', 'no_tool'],
  ['E12', 'Ringkas bulan ini dan stok yang perlu diperhatikan', 'get_summary,get_inventory']
] as const;

console.log('== set evaluasi Copilot ==');
for (const [id, question, expected] of cases) console.log(`${id}\t${expected}\t${question}`);
console.log(`\n${cases.length} kasus; jalankan melalui /copilot setelah UI chat siap.`);
