import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { business, staffInvitation, user } from '$lib/server/db/schema';
import { hashInviteToken, staffPlaceholderEmail } from '$lib/server/invites';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

type InviteStatus = 'valid' | 'expired' | 'invalid';

async function lookup(token: string) {
  const tokenHash = await hashInviteToken(token);
  const [invite] = await db.select().from(staffInvitation).where(eq(staffInvitation.tokenHash, tokenHash));
  return invite ?? null;
}

export const load: PageServerLoad = async ({ locals, params }) => {
  // Staff yang sudah login tidak perlu aktivasi — lempar ke rute peran.
  if (locals.user) throw redirect(303, '/');

  const invite = await lookup(params.token);
  if (!invite || invite.acceptedAt || invite.revokedAt) {
    return { status: 'invalid' as InviteStatus };
  }
  const [b] = await db.select({ name: business.name }).from(business).where(eq(business.id, invite.businessId));
  if (invite.expiresAt.getTime() < Date.now()) {
    return {
      status: 'expired' as InviteStatus,
      businessName: b?.name ?? 'Bisnis',
      username: invite.username
    };
  }
  return {
    status: 'valid' as InviteStatus,
    businessName: b?.name ?? 'Bisnis',
    username: invite.username,
    name: invite.name ?? '',
    expiresAt: invite.expiresAt.toISOString()
  };
};

export const actions: Actions = {
  accept: async ({ params, request }) => {
    const invite = await lookup(params.token);
    // Pesan generik untuk semua link mati — jangan bocorkan alasan
    // (expired vs dicabut vs sudah dipakai) ke pemegang link.
    if (!invite || invite.acceptedAt || invite.revokedAt) {
      return fail(400, { invalid: true, message: 'Undangan tidak berlaku. Minta link baru ke owner.' });
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return fail(400, { expired: true, message: 'Undangan kedaluwarsa. Minta link baru ke owner.' });
    }

    const form = await request.formData();
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirmPassword') ?? '');
    const name = String(form.get('name') ?? '').trim() || invite.name || invite.username;

    if (password.length < 6) {
      return fail(400, { message: 'Password minimal 6 karakter.' });
    }
    if (password !== confirm) {
      return fail(400, { message: 'Konfirmasi password tidak cocok.' });
    }

    const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.username, invite.username));
    if (existingUser) {
      return fail(409, { message: 'Username ini sudah dipakai. Silakan masuk.' });
    }

    let signUpResult;
    try {
      // Kolom user.email NOT NULL tapi staff tak wajib punya email:
      // pakai email sintetis (domain reserved, tak bisa di-routing).
      // Login staff selalu via username, email ini tak pernah ditampilkan.
      signUpResult = await auth.api.signUpEmail({
        body: { email: staffPlaceholderEmail(invite.username), password, name, username: invite.username }
      });
    } catch {
      // Bedakan duplikat beneran (race: username dibuat di sela cek dan signup)
      // dari kegagalan lain — pesan "dipakai" untuk error sembarang
      // menutupi bug beneran (pernah kejadian: default role plugin "user"
      // bukan anggota enum PG sehingga SEMUA signup gagal).
      const [raced] = await db.select({ id: user.id }).from(user).where(eq(user.username, invite.username));
      if (raced) return fail(409, { message: 'Username ini sudah dipakai. Silakan masuk.' });
      return fail(500, { message: 'Gagal membuat akun, coba lagi.' });
    }

    await db.update(user).set({ role: 'STAFF', businessId: invite.businessId }).where(eq(user.id, signUpResult.user.id));
    await db.update(staffInvitation).set({ acceptedAt: new Date() }).where(eq(staffInvitation.id, invite.id));

    // Idempotent: kalau link diklik/submit 2x, submit kedua jatuh ke
    // cabang acceptedAt di atas (bukan akun dobel).
    throw redirect(303, '/login?invited=1');
  }
};
