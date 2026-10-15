// Penjaga skrip penulis data: hanya boleh jalan ke DB scratch.
// Syarat: ALLOW_DESTRUCTIVE_DB=1, SCRATCH_DB_HOST terisi, hostname DATABASE_URL sama.
export function assertScratchDb(): void {
  const url = process.env.DATABASE_URL;
  const allow = process.env.ALLOW_DESTRUCTIVE_DB;
  const host = process.env.SCRATCH_DB_HOST;
  const actual = url ? hostnameOf(url) : null;
  const reason = !url
    ? 'DATABASE_URL kosong.'
    : allow !== '1'
      ? 'ALLOW_DESTRUCTIVE_DB bukan 1.'
      : !host
        ? 'SCRATCH_DB_HOST kosong.'
        : actual !== host
          ? 'Hostname DATABASE_URL beda dengan SCRATCH_DB_HOST.'
          : null;
  if (reason !== null) {
    console.error(`Bukan DB scratch, berhenti: ${reason}`);
    process.exit(1);
  }
  console.log(`DB scratch: ${host}`);
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
