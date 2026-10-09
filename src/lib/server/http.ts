export type JsonObject = Record<string, unknown>;

export type ReadJsonResult = { ok: true; body: JsonObject } | { ok: false; message: string };

// Body rusak, kosong, null, array, atau bukan objek ditolak dengan pesan ramah.
export async function readJsonObject(request: { json(): Promise<unknown> }): Promise<ReadJsonResult> {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return { ok: false, message: 'Body harus JSON.' };
	}
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		return { ok: false, message: 'Body harus JSON objek.' };
	}
	return { ok: true, body: data as JsonObject };
}
