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
  ['E12', 'Ringkas bulan ini dan stok yang perlu diperhatikan', 'get_summary,get_inventory'],
  ['E13', 'Hari apa paling ramai dalam 3 bulan terakhir?', 'query_metrics:metric=tx_count,group_by=weekday,order=desc'],
  ['E14', 'Jam berapa paling sepi?', 'query_metrics:metric=tx_count,group_by=hour,order=asc'],
  ['E15', 'Omzet per hari minggu ini?', 'query_metrics:metric=revenue,group_by=day'],
  ['E16', 'Omzet bulan ini per minggu?', 'query_metrics:metric=revenue,group_by=week'],
  ['E17', 'Margin per hari 2 minggu terakhir, kapan paling tipis?', 'query_metrics:metric=margin,group_by=day,order=asc'],
  ['E18', 'Total diskon yang kita kasih bulan lalu?', 'query_metrics:metric=discount_total,group_by=none,period=last_month'],
  ['E19', 'Rata-rata belanja per struk hari Sabtu dibanding Senin?', 'query_metrics:metric=avg_ticket,group_by=weekday'],
  ['E20', 'Amplang paling laku hari apa?', 'query_metrics:metric=qty,group_by=weekday,product=Amplang'],
  ['E21', 'Pembayaran QRIS berapa banyak bulan ini?', 'no_tool'],
  ['E22', 'Pelanggan siapa yang paling sering belanja?', 'no_tool'],
  ['E23', 'Prediksi omzet bulan depan berapa?', 'no_tool']
] as const;

console.log('== set evaluasi Copilot ==');
for (const [id, question, expected] of cases) console.log(`${id}\t${expected}\t${question}`);
console.log(`\n${cases.length} kasus; jalankan melalui /copilot setelah UI chat siap.`);
