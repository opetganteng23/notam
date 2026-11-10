// Wilayah (cabang): kumpulan bandara. Pengguna non-ADMIN yang ditempatkan di satu atau lebih wilayah hanya dapat membuat, memutuskan, dan menyunting
// NOTAM untuk bandara di wilayahnya. Pengguna tanpa wilayah tidak dibatasi (agar akun lama tetap berfungsi). Melihat peta dan analytics tetap nasional.
export interface RegionLite { code: string; airports: string[] }

// null = tidak dibatasi; selain itu himpunan bandara yang boleh diproses.
export function allowedAirports(all: RegionLite[], codes: string[] | undefined | null): Set<string> | null {
  if (!codes?.length) return null;
  return new Set(all.filter((r) => codes.includes(r.code)).flatMap((r) => r.airports));
}

export const REGION_CODE = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;
export const MAX_REGION_NAME = 80;
