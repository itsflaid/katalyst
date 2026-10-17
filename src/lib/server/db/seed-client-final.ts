import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import { randomUUID } from 'node:crypto';

// Seed data client (bukan demo): penjualan, restock, dan stok Juli-September 2026 dari Excel final toko.
// Menimpa seluruh data produk, diskon, transaksi, ledger stok, dan riwayat Copilot; bisnis, akun, zakat, activity_log tetap.
// Prasyarat: 1 bisnis + OWNER. Gagal pemeriksaan = rollback otomatis, data lama utuh. Pakai DATABASE_URL direct.

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL belum di-set. Cek .env.');
}

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

// Harga master terbaru per produk (setelah restock terakhir). [nama, modal, jual]
const PRODUCTS: [name: string, cost: number, price: number][] = [
  ['Beras Kura-Kura 5 kg', 82980, 87000],
  ['Beras Kura-Kura 10 kg', 164210, 169000],
  ['Beras Kura-Kura 25 kg', 407400, 414000],
  ['Beras Anak Ayam 5 kg', 77480, 81000],
  ['Beras Anak Ayam 10 kg', 153210, 158000],
  ['Beras Anak Ayam 25 kg', 379900, 384000],
  ['Beras Telur Mas 5 kg', 67480, 77000],
  ['Beras Telur Mas 10 kg', 144580, 153000],
  ['Beras Telur Mas 25 kg', 355000, 374000],
  ['Cleo Cup', 20700, 25000],
  ['Cleo Classic SR 6 LT', 29304, 35000],
  ['Cleo Mini', 17715, 23000],
  ['Cleo 3D 330 ml', 36430, 44000],
  ['Cleo 3D 550 ml', 42636, 51000],
  ['Cleo 3D SR 550 ml', 35297, 48000],
  ['Cleo 3D 1500 ml', 48398, 57000],
  ['Cleo Galon 19 LT', 18223, 23000],
  ['Cleo Galon SE 19 LT', 29475, 36000]
];

// Satu baris = satu struk. ref = nomor DO, atau AGS-<baris sheet Agustus> untuk catatan tanpa DO.
// `at` dalam UTC (WITA - 8 jam); cashier null = pakai nama owner; lines: [produk, qty, harga saat itu, modal saat itu].
// Harga ikut tanggal berlaku (harga master per bulan + perubahan saat restock), bukan harga master terbaru.
const RECEIPTS: {
  ref: string;
  at: string;
  cashier: string | null;
  lines: [product: string, qty: number, price: number, cost: number][];
}[] = [
  { ref: 'DO-62', at: '2026-07-01T02:00:00Z', cashier: 'Indra', lines: [['Beras Kura-Kura 25 kg', 10, 414000, 386875]] },
  {
    ref: 'DO-83C',
    at: '2026-07-01T02:10:00Z',
    cashier: null,
    lines: [
      ['Cleo Classic SR 6 LT', 1, 35000, 29304],
      ['Cleo Mini', 50, 23000, 18323]
    ]
  },
  {
    ref: 'DO-63',
    at: '2026-07-02T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Telur Mas 5 kg', 14, 78000, 74380],
      ['Beras Telur Mas 10 kg', 2, 150000, 142020]
    ]
  },
  {
    ref: 'DO-64',
    at: '2026-07-02T02:10:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 5, 87000, 78750],
      ['Beras Kura-Kura 10 kg', 5, 170000, 157000]
    ]
  },
  {
    ref: 'DO-65',
    at: '2026-07-02T02:20:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 150, 87000, 78750],
      ['Beras Kura-Kura 10 kg', 150, 170000, 157000],
      ['Beras Kura-Kura 25 kg', 100, 414000, 386875]
    ]
  },
  { ref: 'DO-84C', at: '2026-07-02T02:30:00Z', cashier: null, lines: [['Cleo Mini', 20, 23000, 18323]] },
  { ref: 'DO-65.5', at: '2026-07-03T02:00:00Z', cashier: 'Komura', lines: [['Beras Anak Ayam 10 kg', 1196, 158000, 153010]] },
  {
    ref: 'DO-66',
    at: '2026-07-04T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 353, 87000, 78750],
      ['Beras Kura-Kura 10 kg', 226, 170000, 157000],
      ['Beras Kura-Kura 25 kg', 276, 414000, 386875],
      ['Beras Anak Ayam 5 kg', 10, 82000, 77380],
      ['Beras Anak Ayam 10 kg', 4, 158000, 153010]
    ]
  },
  {
    ref: 'DO-67',
    at: '2026-07-05T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 30, 87000, 78750],
      ['Beras Kura-Kura 10 kg', 30, 170000, 157000]
    ]
  },
  {
    ref: 'DO-68',
    at: '2026-07-06T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 355, 87000, 78750],
      ['Beras Kura-Kura 10 kg', 233, 170000, 157000],
      ['Beras Kura-Kura 25 kg', 275, 414000, 386875]
    ]
  },
  {
    ref: 'DO-69',
    at: '2026-07-07T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 389, 87000, 78750],
      ['Beras Kura-Kura 10 kg', 215, 170000, 157000],
      ['Beras Kura-Kura 25 kg', 40, 414000, 386875]
    ]
  },
  { ref: 'DO-85C', at: '2026-07-08T02:00:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 15, 44000, 35498]] },
  {
    ref: 'DO-70',
    at: '2026-07-10T02:00:00Z',
    cashier: 'Depot',
    lines: [
      ['Beras Kura-Kura 5 kg', 6, 87000, 78750],
      ['Beras Kura-Kura 10 kg', 6, 170000, 157000],
      ['Beras Kura-Kura 25 kg', 2, 414000, 386875],
      ['Beras Anak Ayam 5 kg', 15, 82000, 77380],
      ['Beras Anak Ayam 10 kg', 30, 158000, 153010]
    ]
  },
  {
    ref: 'DO-71',
    at: '2026-07-11T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 14, 87000, 78750],
      ['Beras Kura-Kura 25 kg', 1, 414000, 386875],
      ['Beras Anak Ayam 5 kg', 15, 82000, 77380],
      ['Beras Telur Mas 5 kg', 15, 78000, 74380]
    ]
  },
  { ref: 'DO-72', at: '2026-07-11T02:10:00Z', cashier: 'Indra', lines: [['Beras Kura-Kura 5 kg', 139, 87000, 78750]] },
  {
    ref: 'DO-86C',
    at: '2026-07-11T02:20:00Z',
    cashier: null,
    lines: [
      ['Cleo Classic SR 6 LT', 1, 35000, 29304],
      ['Cleo Mini', 50, 23000, 18715]
    ]
  },
  {
    ref: 'DO-87C',
    at: '2026-07-11T02:30:00Z',
    cashier: null,
    lines: [
      ['Cleo Mini', 4, 23000, 18715],
      ['Cleo Galon 19 LT', 2, 23000, 18223]
    ]
  },
  { ref: 'DO-88C', at: '2026-07-13T02:00:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 10, 44000, 36430]] },
  { ref: 'DO-89C', at: '2026-07-14T02:00:00Z', cashier: null, lines: [['Cleo Mini', 30, 23000, 18715]] },
  { ref: 'DO-90C', at: '2026-07-15T02:00:00Z', cashier: null, lines: [['Cleo Cup', 3, 25000, 20700]] },
  { ref: 'DO-73', at: '2026-07-18T02:00:00Z', cashier: 'Indra', lines: [['Beras Anak Ayam 10 kg', 11, 158000, 153010]] },
  {
    ref: 'DO-91C',
    at: '2026-07-23T02:00:00Z',
    cashier: null,
    lines: [
      ['Cleo Classic SR 6 LT', 1, 35000, 29304],
      ['Cleo Mini', 50, 23000, 18715]
    ]
  },
  { ref: 'DO-92C', at: '2026-07-23T02:10:00Z', cashier: null, lines: [['Cleo Mini', 20, 23000, 18715]] },
  {
    ref: 'DO-93C',
    at: '2026-07-25T02:00:00Z',
    cashier: null,
    lines: [
      ['Cleo Mini', 2, 23000, 18715],
      ['Cleo Galon 19 LT', 2, 23000, 18223]
    ]
  },
  { ref: 'DO-94C', at: '2026-07-25T02:10:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 10, 44000, 36430]] },
  {
    ref: 'DO-74',
    at: '2026-07-27T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 10 kg', 30, 170000, 164210],
      ['Beras Kura-Kura 25 kg', 140, 415000, 407400]
    ]
  },
  {
    ref: 'DO-75',
    at: '2026-07-27T02:10:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 100, 87000, 82980],
      ['Beras Kura-Kura 10 kg', 100, 170000, 164210],
      ['Beras Kura-Kura 25 kg', 100, 415000, 407400]
    ]
  },
  {
    ref: 'DO-76',
    at: '2026-07-28T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 99, 87000, 82980],
      ['Beras Kura-Kura 10 kg', 20, 170000, 164210],
      ['Beras Kura-Kura 25 kg', 18, 415000, 407400]
    ]
  },
  {
    ref: 'DO-77',
    at: '2026-07-28T02:10:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 20, 87000, 82980],
      ['Beras Kura-Kura 10 kg', 5, 170000, 164210],
      ['Beras Anak Ayam 5 kg', 6, 82000, 77480],
      ['Beras Anak Ayam 25 kg', 3, 387000, 379900]
    ]
  },
  {
    ref: 'DO-78',
    at: '2026-07-29T02:00:00Z',
    cashier: 'Khaidir',
    lines: [
      ['Beras Kura-Kura 5 kg', 30, 87000, 82980],
      ['Beras Kura-Kura 10 kg', 5, 170000, 164210],
      ['Beras Kura-Kura 25 kg', 10, 415000, 407400]
    ]
  },
  {
    ref: 'DO-79',
    at: '2026-07-29T02:10:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 40, 87000, 82980],
      ['Beras Kura-Kura 10 kg', 5, 170000, 164210]
    ]
  },
  {
    ref: 'DO-95C',
    at: '2026-07-29T02:20:00Z',
    cashier: null,
    lines: [
      ['Cleo 3D 550 ml', 2, 51000, 42636],
      ['Cleo Galon 19 LT', 3, 23000, 18223]
    ]
  },
  {
    ref: 'DO-80',
    at: '2026-07-30T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Anak Ayam 5 kg', 14, 82000, 77480],
      ['Beras Anak Ayam 10 kg', 3, 158000, 153210]
    ]
  },
  { ref: 'DO-96C', at: '2026-07-30T02:10:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 10, 44000, 36430]] },
  {
    ref: 'DO-97C',
    at: '2026-07-30T02:20:00Z',
    cashier: null,
    lines: [
      ['Cleo Classic SR 6 LT', 1, 35000, 29304],
      ['Cleo Mini', 50, 23000, 18715]
    ]
  },
  {
    ref: 'DO-81',
    at: '2026-07-31T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 10, 87000, 82980],
      ['Beras Kura-Kura 25 kg', 5, 415000, 407400]
    ]
  },
  { ref: 'DO-98C', at: '2026-07-31T02:10:00Z', cashier: null, lines: [['Cleo Mini', 3, 23000, 18715]] },
  { ref: 'AGS-24', at: '2026-08-03T02:00:00Z', cashier: null, lines: [['Beras Anak Ayam 10 kg', 1195, 157000, 153210]] },
  { ref: 'AGS-25', at: '2026-08-04T02:00:00Z', cashier: null, lines: [['Cleo 3D 550 ml', 100, 51000, 42636]] },
  { ref: 'AGS-26', at: '2026-08-04T02:10:00Z', cashier: null, lines: [['Beras Kura-Kura 5 kg', 5, 86000, 82980]] },
  { ref: 'AGS-28', at: '2026-08-05T02:00:00Z', cashier: null, lines: [['Cleo Cup', 3, 25000, 20700]] },
  { ref: 'AGS-29', at: '2026-08-05T02:10:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 15, 44000, 36430]] },
  { ref: 'AGS-30', at: '2026-08-06T02:00:00Z', cashier: null, lines: [['Cleo Galon 19 LT', 2, 23000, 18223]] },
  { ref: 'AGS-31', at: '2026-08-06T02:10:00Z', cashier: null, lines: [['Cleo 3D 1500 ml', 30, 57000, 54000]] },
  { ref: 'AGS-32', at: '2026-08-06T02:20:00Z', cashier: null, lines: [['Cleo Mini', 10, 23000, 17715]] },
  { ref: 'AGS-33', at: '2026-08-06T02:30:00Z', cashier: null, lines: [['Beras Kura-Kura 5 kg', 96, 86000, 82980]] },
  { ref: 'AGS-34', at: '2026-08-06T02:40:00Z', cashier: null, lines: [['Beras Kura-Kura 10 kg', 150, 168000, 164210]] },
  { ref: 'AGS-35', at: '2026-08-06T02:50:00Z', cashier: null, lines: [['Beras Kura-Kura 25 kg', 27, 412000, 407400]] },
  { ref: 'AGS-36', at: '2026-08-11T02:00:00Z', cashier: null, lines: [['Cleo Classic SR 6 LT', 1, 35000, 29304]] },
  { ref: 'AGS-37', at: '2026-08-11T02:10:00Z', cashier: null, lines: [['Cleo Mini', 50, 23000, 17715]] },
  { ref: 'AGS-38', at: '2026-08-11T02:20:00Z', cashier: null, lines: [['Cleo Mini', 15, 23000, 17715]] },
  { ref: 'AGS-39', at: '2026-08-15T02:00:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 15, 44000, 36430]] },
  { ref: 'AGS-40', at: '2026-08-19T02:00:00Z', cashier: null, lines: [['Cleo Galon 19 LT', 2, 23000, 18223]] },
  { ref: 'AGS-41', at: '2026-08-21T02:00:00Z', cashier: null, lines: [['Cleo Classic SR 6 LT', 1, 35000, 29304]] },
  { ref: 'AGS-42', at: '2026-08-21T02:10:00Z', cashier: null, lines: [['Cleo Mini', 50, 23000, 17715]] },
  { ref: 'AGS-52', at: '2026-08-24T02:00:00Z', cashier: null, lines: [['Cleo Mini', 2, 23000, 17715]] },
  { ref: 'AGS-53', at: '2026-08-24T02:10:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 2, 44000, 36430]] },
  { ref: 'AGS-54', at: '2026-08-24T02:20:00Z', cashier: null, lines: [['Beras Kura-Kura 25 kg', 5, 412000, 407400]] },
  { ref: 'AGS-56', at: '2026-08-24T02:30:00Z', cashier: null, lines: [['Beras Kura-Kura 5 kg', 30, 86000, 82980]] },
  { ref: 'AGS-57', at: '2026-08-24T02:40:00Z', cashier: null, lines: [['Beras Kura-Kura 10 kg', 30, 168000, 164210]] },
  { ref: 'AGS-58', at: '2026-08-24T02:50:00Z', cashier: null, lines: [['Beras Kura-Kura 25 kg', 5, 412000, 407400]] },
  { ref: 'AGS-59', at: '2026-08-24T03:00:00Z', cashier: null, lines: [['Beras Anak Ayam 5 kg', 30, 80000, 77480]] },
  { ref: 'AGS-60', at: '2026-08-24T03:10:00Z', cashier: null, lines: [['Beras Anak Ayam 25 kg', 5, 384000, 379900]] },
  { ref: 'AGS-61', at: '2026-08-24T03:20:00Z', cashier: null, lines: [['Beras Kura-Kura 5 kg', 5, 86000, 82980]] },
  { ref: 'AGS-62', at: '2026-08-24T03:30:00Z', cashier: null, lines: [['Beras Kura-Kura 10 kg', 1, 168000, 164210]] },
  { ref: 'AGS-63', at: '2026-08-24T03:40:00Z', cashier: null, lines: [['Beras Kura-Kura 5 kg', 3, 86000, 82980]] },
  { ref: 'AGS-64', at: '2026-08-26T02:00:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 10, 44000, 36430]] },
  { ref: 'AGS-65', at: '2026-08-26T02:10:00Z', cashier: null, lines: [['Beras Kura-Kura 5 kg', 10, 86000, 82980]] },
  { ref: 'AGS-66', at: '2026-08-26T02:20:00Z', cashier: null, lines: [['Beras Kura-Kura 5 kg', 5, 86000, 82980]] },
  { ref: 'AGS-67', at: '2026-08-26T02:30:00Z', cashier: null, lines: [['Beras Anak Ayam 25 kg', 5, 384000, 379900]] },
  { ref: 'AGS-68', at: '2026-08-27T02:00:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 10, 44000, 36430]] },
  { ref: 'AGS-69', at: '2026-08-27T02:10:00Z', cashier: null, lines: [['Beras Kura-Kura 25 kg', 1, 412000, 407400]] },
  { ref: 'AGS-70', at: '2026-08-27T02:20:00Z', cashier: null, lines: [['Beras Anak Ayam 10 kg', 2, 157000, 153210]] },
  { ref: 'AGS-71', at: '2026-08-29T02:00:00Z', cashier: null, lines: [['Beras Kura-Kura 10 kg', 50, 168000, 164210]] },
  { ref: 'AGS-72', at: '2026-08-29T02:10:00Z', cashier: null, lines: [['Beras Kura-Kura 25 kg', 15, 412000, 407400]] },
  { ref: 'AGS-73', at: '2026-08-29T02:20:00Z', cashier: null, lines: [['Beras Kura-Kura 25 kg', 30, 412000, 407400]] },
  { ref: 'AGS-74', at: '2026-08-29T02:30:00Z', cashier: null, lines: [['Beras Kura-Kura 5 kg', 20, 86000, 82980]] },
  { ref: 'AGS-75', at: '2026-08-29T02:40:00Z', cashier: null, lines: [['Beras Kura-Kura 10 kg', 20, 168000, 164210]] },
  { ref: 'AGS-76', at: '2026-08-29T02:50:00Z', cashier: null, lines: [['Beras Kura-Kura 25 kg', 50, 412000, 407400]] },
  { ref: 'AGS-77', at: '2026-08-29T03:00:00Z', cashier: null, lines: [['Beras Kura-Kura 5 kg', 5, 86000, 82980]] },
  { ref: 'AGS-79', at: '2026-08-31T02:00:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 4, 44000, 36430]] },
  { ref: 'AGS-80', at: '2026-08-31T02:10:00Z', cashier: null, lines: [['Cleo 3D 550 ml', 2, 51000, 42636]] },
  { ref: 'AGS-81', at: '2026-08-31T02:20:00Z', cashier: null, lines: [['Cleo Galon 19 LT', 2, 23000, 18223]] },
  { ref: 'DO-98', at: '2026-09-01T02:00:00Z', cashier: 'Indra', lines: [['Beras Kura-Kura 25 kg', 249, 412000, 407400]] },
  { ref: 'DO-114C', at: '2026-09-01T02:10:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 10, 44000, 36430]] },
  { ref: 'DO-99', at: '2026-09-02T02:00:00Z', cashier: 'Komura', lines: [['Beras Anak Ayam 10 kg', 1196, 157000, 153210]] },
  {
    ref: 'DO-100',
    at: '2026-09-02T02:10:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 25 kg', 1, 412000, 407400],
      ['Beras Anak Ayam 10 kg', 1, 157000, 153210],
      ['Beras Anak Ayam 25 kg', 1, 384000, 379900]
    ]
  },
  {
    ref: 'DO-101',
    at: '2026-09-02T02:20:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 5, 86000, 82980],
      ['Beras Kura-Kura 10 kg', 5, 168000, 164210],
      ['Beras Kura-Kura 25 kg', 5, 412000, 407400]
    ]
  },
  {
    ref: 'DO-102',
    at: '2026-09-03T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 200, 86000, 82980],
      ['Beras Kura-Kura 10 kg', 100, 168000, 164210]
    ]
  },
  {
    ref: 'DO-115C',
    at: '2026-09-03T02:10:00Z',
    cashier: null,
    lines: [
      ['Cleo Classic SR 6 LT', 1, 35000, 29304],
      ['Cleo Mini', 50, 23000, 17715]
    ]
  },
  { ref: 'DO-116C', at: '2026-09-03T02:20:00Z', cashier: null, lines: [['Cleo Mini', 20, 23000, 17715]] },
  { ref: 'DO-117C', at: '2026-09-04T02:00:00Z', cashier: null, lines: [['Cleo Galon 19 LT', 2, 23000, 18223]] },
  { ref: 'DO-118C', at: '2026-09-04T02:10:00Z', cashier: null, lines: [['Cleo Mini', 16, 23000, 17715]] },
  { ref: 'DO-103', at: '2026-09-05T02:00:00Z', cashier: 'Hj. Siah', lines: [['Beras Kura-Kura 5 kg', 1, 86000, 82980]] },
  {
    ref: 'DO-104',
    at: '2026-09-05T02:10:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 10 kg', 200, 168000, 164210],
      ['Beras Kura-Kura 25 kg', 351, 412000, 407400]
    ]
  },
  { ref: 'DO-105', at: '2026-09-08T02:00:00Z', cashier: 'Indra', lines: [['Beras Kura-Kura 5 kg', 70, 86000, 82980]] },
  { ref: 'DO-106', at: '2026-09-09T02:00:00Z', cashier: 'Bayu', lines: [['Beras Kura-Kura 5 kg', 1, 86000, 82980]] },
  { ref: 'DO-119C', at: '2026-09-09T02:10:00Z', cashier: null, lines: [['Cleo Galon 19 LT', 1, 23000, 18223]] },
  {
    ref: 'DO-107',
    at: '2026-09-10T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 30, 86000, 82980],
      ['Beras Kura-Kura 10 kg', 40, 168000, 164210],
      ['Beras Kura-Kura 25 kg', 121, 412000, 407400]
    ]
  },
  {
    ref: 'DO-108',
    at: '2026-09-10T02:10:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 20, 86000, 82980],
      ['Beras Kura-Kura 10 kg', 10, 168000, 164210],
      ['Beras Kura-Kura 25 kg', 10, 412000, 407400]
    ]
  },
  { ref: 'DO-120C', at: '2026-09-10T02:20:00Z', cashier: null, lines: [['Cleo Galon SE 19 LT', 4, 36000, 29475]] },
  { ref: 'DO-121C', at: '2026-09-11T02:00:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 12, 44000, 36430]] },
  {
    ref: 'DO-109',
    at: '2026-09-12T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 360, 86000, 82980],
      ['Beras Kura-Kura 10 kg', 100, 168000, 164210],
      ['Beras Kura-Kura 25 kg', 30, 412000, 407400]
    ]
  },
  {
    ref: 'DO-110',
    at: '2026-09-12T02:10:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 50, 86000, 82980],
      ['Beras Kura-Kura 10 kg', 50, 168000, 164210],
      ['Beras Kura-Kura 25 kg', 20, 412000, 407400]
    ]
  },
  { ref: 'DO-111', at: '2026-09-12T02:20:00Z', cashier: 'Indra', lines: [['Beras Kura-Kura 10 kg', 100, 168000, 164210]] },
  { ref: 'DO-122C', at: '2026-09-15T02:00:00Z', cashier: null, lines: [['Cleo Galon 19 LT', 2, 23000, 18223]] },
  { ref: 'DO-123C', at: '2026-09-16T02:00:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 10, 44000, 36430]] },
  { ref: 'DO-124C', at: '2026-09-16T02:10:00Z', cashier: null, lines: [['Cleo Galon SE 19 LT', 1, 36000, 29475]] },
  {
    ref: 'DO-112',
    at: '2026-09-17T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 130, 86000, 82980],
      ['Beras Kura-Kura 10 kg', 84, 168000, 164210],
      ['Beras Kura-Kura 25 kg', 53, 412000, 407400]
    ]
  },
  { ref: 'DO-113', at: '2026-09-21T02:00:00Z', cashier: 'Indra', lines: [['Beras Kura-Kura 10 kg', 1, 169000, 164210]] },
  {
    ref: 'DO-125C',
    at: '2026-09-22T02:00:00Z',
    cashier: null,
    lines: [
      ['Cleo 3D 330 ml', 5, 44000, 36430],
      ['Cleo 3D 550 ml', 3, 51000, 42636],
      ['Cleo Galon 19 LT', 3, 23000, 18223]
    ]
  },
  {
    ref: 'DO-114',
    at: '2026-09-23T02:00:00Z',
    cashier: null,
    lines: [
      ['Beras Kura-Kura 5 kg', 5, 87000, 82980],
      ['Beras Kura-Kura 10 kg', 1, 169000, 164210]
    ]
  },
  { ref: 'DO-126C', at: '2026-09-23T02:10:00Z', cashier: null, lines: [['Cleo Galon 19 LT', 1, 23000, 18223]] },
  {
    ref: 'DO-115',
    at: '2026-09-24T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 230, 87000, 82980],
      ['Beras Kura-Kura 10 kg', 145, 169000, 164210],
      ['Beras Kura-Kura 25 kg', 154, 414000, 407400]
    ]
  },
  {
    ref: 'DO-127C',
    at: '2026-09-24T02:10:00Z',
    cashier: null,
    lines: [
      ['Cleo Mini', 6, 23000, 17715],
      ['Cleo Galon 19 LT', 2, 23000, 18223]
    ]
  },
  {
    ref: 'DO-128C',
    at: '2026-09-24T02:20:00Z',
    cashier: null,
    lines: [
      ['Cleo Classic SR 6 LT', 1, 35000, 29304],
      ['Cleo Mini', 50, 23000, 17715]
    ]
  },
  { ref: 'DO-129C', at: '2026-09-26T02:00:00Z', cashier: null, lines: [['Cleo Galon 19 LT', 1, 23000, 18223]] },
  { ref: 'DO-130C', at: '2026-09-26T02:10:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 10, 44000, 36430]] },
  {
    ref: 'DO-116',
    at: '2026-09-27T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 10, 87000, 82980],
      ['Beras Kura-Kura 10 kg', 5, 169000, 164210],
      ['Beras Telur Mas 5 kg', 3, 77000, 67480],
      ['Beras Telur Mas 25 kg', 3, 374000, 355000]
    ]
  },
  {
    ref: 'DO-117',
    at: '2026-09-28T02:00:00Z',
    cashier: 'Indra',
    lines: [
      ['Beras Kura-Kura 5 kg', 100, 87000, 82980],
      ['Beras Kura-Kura 10 kg', 65, 169000, 164210],
      ['Beras Kura-Kura 25 kg', 75, 414000, 407400]
    ]
  },
  { ref: 'DO-118', at: '2026-09-28T02:10:00Z', cashier: 'Hj. Siah', lines: [['Beras Kura-Kura 5 kg', 1, 87000, 82980]] },
  { ref: 'DO-131C', at: '2026-09-28T02:20:00Z', cashier: null, lines: [['Cleo 3D 330 ml', 15, 44000, 36430]] }
];

// Ledger stok non-penjualan. [waktu UTC, produk, qty, alasan, catatan]
// ADJUST = penyesuaian agar saldo ledger sama dengan stok awal bulan berikutnya / menutup penjualan tanpa restock tercatat.
const STOCK: [at: string, product: string, qty: number, reason: 'RESTOCK' | 'ADJUST', note: string][] = [
  ['2026-07-01T00:00:00Z', 'Beras Anak Ayam 10 kg', 1242, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Beras Anak Ayam 25 kg', 11, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Beras Anak Ayam 5 kg', 40, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Beras Kura-Kura 10 kg', 865, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Beras Kura-Kura 25 kg', 704, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Beras Kura-Kura 5 kg', 1441, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Beras Telur Mas 10 kg', 5, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Beras Telur Mas 25 kg', 3, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Beras Telur Mas 5 kg', 30, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Cleo 3D 1500 ml', 3, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Cleo 3D 330 ml', 65, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Cleo Classic SR 6 LT', 11, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Cleo Cup', 85, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Cleo Galon 19 LT', 23, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-01T00:00:00Z', 'Cleo Mini', 143, 'RESTOCK', 'Stok awal Juli 2026 (data master toko)'],
  ['2026-07-11T01:00:00Z', 'Cleo 3D 330 ml', 230, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-11T01:00:00Z', 'Cleo 3D 550 ml', 200, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-11T01:00:00Z', 'Cleo Galon 19 LT', 21, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-11T01:00:00Z', 'Cleo Mini', 350, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-25T01:00:00Z', 'Beras Anak Ayam 10 kg', 1200, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-25T01:00:00Z', 'Beras Anak Ayam 25 kg', 10, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-25T01:00:00Z', 'Beras Anak Ayam 5 kg', 20, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-25T01:00:00Z', 'Beras Kura-Kura 10 kg', 315, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-25T01:00:00Z', 'Beras Kura-Kura 25 kg', 300, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-25T01:00:00Z', 'Beras Kura-Kura 5 kg', 400, 'RESTOCK', 'Restock dari produsen'],
  ['2026-07-31T15:00:00Z', 'Beras Anak Ayam 25 kg', -11, 'ADJUST', 'Penyesuaian akhir Juli 2026 ke stok awal Agustus (selisih tanpa catatan)'],
  ['2026-07-31T15:00:00Z', 'Beras Telur Mas 25 kg', -3, 'ADJUST', 'Penyesuaian akhir Juli 2026 ke stok awal Agustus (selisih tanpa catatan)'],
  ['2026-07-31T15:00:00Z', 'Cleo 3D 550 ml', -7, 'ADJUST', 'Penyesuaian akhir Juli 2026 ke stok awal Agustus (selisih tanpa catatan)'],
  ['2026-08-05T01:00:00Z', 'Cleo Mini', 30, 'RESTOCK', 'Restock dari produsen'],
  ['2026-08-06T00:30:00Z', 'Cleo 3D 1500 ml', 30, 'ADJUST', 'Restock belum tercatat (menutup penjualan 6 Agustus 2026)'],
  ['2026-08-23T01:00:00Z', 'Beras Anak Ayam 10 kg', 1250, 'RESTOCK', 'Restock dari produsen'],
  ['2026-08-23T01:00:00Z', 'Beras Anak Ayam 25 kg', 20, 'RESTOCK', 'Restock dari produsen'],
  ['2026-08-23T01:00:00Z', 'Beras Anak Ayam 5 kg', 30, 'RESTOCK', 'Restock dari produsen'],
  ['2026-08-23T01:00:00Z', 'Beras Kura-Kura 10 kg', 800, 'RESTOCK', 'Restock dari produsen'],
  ['2026-08-23T01:00:00Z', 'Beras Kura-Kura 25 kg', 946, 'RESTOCK', 'Restock dari produsen'],
  ['2026-08-23T01:00:00Z', 'Beras Kura-Kura 5 kg', 950, 'RESTOCK', 'Restock dari produsen'],
  ['2026-08-31T15:00:00Z', 'Beras Telur Mas 10 kg', 10, 'ADJUST', 'Penyesuaian akhir Agustus 2026 ke stok awal September (selisih tanpa catatan)'],
  ['2026-08-31T15:00:00Z', 'Beras Telur Mas 25 kg', 10, 'ADJUST', 'Penyesuaian akhir Agustus 2026 ke stok awal September (selisih tanpa catatan)'],
  ['2026-08-31T15:00:00Z', 'Beras Telur Mas 5 kg', 14, 'ADJUST', 'Penyesuaian akhir Agustus 2026 ke stok awal September (selisih tanpa catatan)'],
  ['2026-08-31T15:00:00Z', 'Cleo 3D 550 ml', -8, 'ADJUST', 'Penyesuaian akhir Agustus 2026 ke stok awal September (selisih tanpa catatan)'],
  ['2026-08-31T15:00:00Z', 'Cleo Mini', -30, 'ADJUST', 'Penyesuaian akhir Agustus 2026 ke stok awal September (selisih tanpa catatan)'],
  ['2026-09-10T00:30:00Z', 'Cleo Galon SE 19 LT', 5, 'ADJUST', 'Pembelian belum tercatat (menutup penjualan September 2026)'],
  ['2026-09-18T01:00:00Z', 'Cleo 3D 1500 ml', 50, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-18T01:00:00Z', 'Cleo 3D 330 ml', 100, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-18T01:00:00Z', 'Cleo 3D 550 ml', 100, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-18T01:00:00Z', 'Cleo Galon 19 LT', 17, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-18T01:00:00Z', 'Cleo Mini', 600, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-21T01:00:00Z', 'Beras Anak Ayam 10 kg', 1196, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-21T01:00:00Z', 'Beras Anak Ayam 5 kg', 20, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-21T01:00:00Z', 'Beras Kura-Kura 10 kg', 300, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-21T01:00:00Z', 'Beras Kura-Kura 25 kg', 300, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-21T01:00:00Z', 'Beras Kura-Kura 5 kg', 488, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-30T01:00:00Z', 'Beras Kura-Kura 10 kg', 600, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-30T01:00:00Z', 'Beras Kura-Kura 25 kg', 620, 'RESTOCK', 'Restock dari produsen'],
  ['2026-09-30T01:00:00Z', 'Beras Kura-Kura 5 kg', 700, 'RESTOCK', 'Restock dari produsen']
];

const MIN_STOCK = 5;
const PRODUCT_CREATED_AT = '2026-06-30T16:00:00Z'; // 1 Juli 2026 00:00 WITA

async function main() {
  const productNames = new Set(PRODUCTS.map(([name]) => name));
  for (const r of RECEIPTS) {
    for (const [product] of r.lines) {
      if (!productNames.has(product)) throw new Error(`Produk tidak dikenal di struk ${r.ref}: ${product}`);
    }
  }
  for (const [, product] of STOCK) {
    if (!productNames.has(product)) throw new Error(`Produk tidak dikenal di ledger stok: ${product}`);
  }

  // Stok akhir yang diharapkan dihitung dari data sendiri (ledger non-penjualan - penjualan).
  const expected = new Map<string, number>(PRODUCTS.map(([name]) => [name, 0]));
  for (const [, product, qty] of STOCK) expected.set(product, (expected.get(product) ?? 0) + qty);
  for (const r of RECEIPTS) {
    for (const [product, qty] of r.lines) expected.set(product, (expected.get(product) ?? 0) - qty);
  }

  const itemCount = RECEIPTS.reduce((n, r) => n + r.lines.length, 0);
  const ledgerCount = STOCK.length + itemCount;

  console.log('Seed data client Juli-September 2026...');

  await db.transaction(async (tx) => {
    const biz = await tx.execute(sql`SELECT count(*)::int AS n FROM business`);
    if (Number(biz[0].n) !== 1) {
      throw new Error('Harus ada tepat 1 bisnis di database ini (jalankan db:seed:real dulu bila kosong).');
    }
    const ctxRows = await tx.execute(sql`
      SELECT b.id AS business_id, u.id AS owner_id, coalesce(u.name, 'Owner') AS owner_name
      FROM business b
      JOIN "user" u ON u.business_id = b.id AND u.role = 'OWNER'
      ORDER BY u.created_at
      LIMIT 1
    `);
    if (ctxRows.length === 0) throw new Error('Akun OWNER untuk bisnis ini tidak ditemukan.');
    const businessId = ctxRows[0].business_id as string;
    const ownerId = ctxRows[0].owner_id as string;
    const ownerName = ctxRows[0].owner_name as string;

    // Reset data operasional (urutan menghormati foreign key).
    await tx.execute(sql`DELETE FROM copilot_message`);
    await tx.execute(sql`DELETE FROM copilot_conversation`);
    await tx.execute(sql`DELETE FROM transaction_item`);
    await tx.execute(sql`DELETE FROM stock_movement`);
    await tx.execute(sql`DELETE FROM "transaction"`);
    await tx.execute(sql`DELETE FROM discount`);
    await tx.execute(sql`DELETE FROM product`);

    // Produk (stok dihitung dari ledger di bawah).
    // ::text::jsonb supaya driver tidak meng-encode JSON dua kali.
    const productsJson = JSON.stringify(PRODUCTS.map(([name, cost, price]) => ({ name, cost, price })));
    await tx.execute(sql`
      INSERT INTO product (id, business_id, name, cost_price, selling_price, stock, min_stock, is_active, created_at, updated_at)
      SELECT gen_random_uuid()::text, ${businessId}, x.name, x.cost, x.price, 0, ${MIN_STOCK}, true,
        (${PRODUCT_CREATED_AT}::timestamptz AT TIME ZONE 'UTC'), now()
      FROM jsonb_to_recordset((${productsJson}::text)::jsonb) AS x(name text, cost int, price int)
    `);

    // Struk. Satu id per struk, dipakai bersama oleh item dan ledger SALE.
    const txs = RECEIPTS.map((r) => ({ id: randomUUID(), ...r }));
    const txJson = JSON.stringify(txs.map((t) => ({ id: t.id, at: t.at, cashier: t.cashier ?? ownerName })));
    await tx.execute(sql`
      INSERT INTO "transaction" (id, business_id, user_id, cashier_name, created_at)
      SELECT x.id, ${businessId}, ${ownerId}, x.cashier, (x.at::timestamptz AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset((${txJson}::text)::jsonb) AS x(id text, at text, cashier text)
    `);

    const itemsJson = JSON.stringify(
      txs.flatMap((t) => t.lines.map(([product, qty, price, cost]) => ({ tx_id: t.id, at: t.at, product, qty, price, cost })))
    );
    await tx.execute(sql`
      INSERT INTO transaction_item (id, transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
      SELECT gen_random_uuid()::text, x.tx_id, p.id, x.qty, x.price, x.cost
      FROM jsonb_to_recordset((${itemsJson}::text)::jsonb) AS x(tx_id text, at text, product text, qty int, price int, cost int)
      JOIN product p ON p.name = x.product
    `);

    // Ledger: restock, stok awal, penyesuaian.
    const stockJson = JSON.stringify(STOCK.map(([at, product, qty, reason, note]) => ({ at, product, qty, reason, note })));
    await tx.execute(sql`
      INSERT INTO stock_movement (id, business_id, product_id, qty_change, reason, ref_tx_id, note, created_by, created_at)
      SELECT gen_random_uuid()::text, ${businessId}, p.id, x.qty, x.reason::stock_reason, NULL, x.note, ${ownerId},
        (x.at::timestamptz AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset((${stockJson}::text)::jsonb) AS x(at text, product text, qty int, reason text, note text)
      JOIN product p ON p.name = x.product
    `);

    // Ledger: penjualan (satu baris per item struk).
    await tx.execute(sql`
      INSERT INTO stock_movement (id, business_id, product_id, qty_change, reason, ref_tx_id, note, created_by, created_at)
      SELECT gen_random_uuid()::text, ${businessId}, p.id, -x.qty, 'SALE'::stock_reason, x.tx_id,
        'Penjualan historis Juli-September 2026', ${ownerId}, (x.at::timestamptz AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset((${itemsJson}::text)::jsonb) AS x(tx_id text, at text, product text, qty int, price int, cost int)
      JOIN product p ON p.name = x.product
    `);

    // Stok produk = jumlah ledger.
    await tx.execute(sql`
      UPDATE product p
      SET stock = coalesce((SELECT sum(m.qty_change) FROM stock_movement m WHERE m.product_id = p.id), 0), updated_at = now()
    `);

    // Verifikasi. Kalau gagal, throw -> rollback.
    const stocks = await tx.execute(sql`SELECT name, stock FROM product`);
    const bad = stocks
      .filter((row) => Number(row.stock) < 0 || Number(row.stock) !== expected.get(row.name as string))
      .map((row) => `${row.name} = ${row.stock} (harusnya ${expected.get(row.name as string)})`);
    if (bad.length > 0) throw new Error(`Stok akhir tidak sesuai: ${bad.join('; ')}`);

    const counts = await tx.execute(sql`
      SELECT
        (SELECT count(*)::int FROM product) AS produk,
        (SELECT count(*)::int FROM "transaction") AS struk,
        (SELECT count(*)::int FROM transaction_item) AS item,
        (SELECT count(*)::int FROM stock_movement) AS ledger
    `);
    const c = counts[0] as { produk: number; struk: number; item: number; ledger: number };
    if (c.produk !== PRODUCTS.length) throw new Error('Jumlah produk tidak sesuai');
    if (c.struk !== RECEIPTS.length) throw new Error('Jumlah struk tidak sesuai');
    if (c.item !== itemCount) throw new Error('Jumlah baris item tidak sesuai');
    if (c.ledger !== ledgerCount) throw new Error('Jumlah baris ledger tidak sesuai');

    const minus = await tx.execute(sql`
      SELECT count(*)::int AS n FROM (
        SELECT sum(qty_change) OVER (PARTITION BY product_id ORDER BY created_at, id) AS running
        FROM stock_movement
      ) r WHERE r.running < 0
    `);
    if (Number(minus[0].n) > 0) throw new Error('Ada saldo stok berjalan yang minus');

    console.log(`Selesai: ${c.produk} produk, ${c.struk} struk, ${c.item} item, ${c.ledger} baris ledger.`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
