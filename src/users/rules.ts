// Aturan akun yang dipakai bersama oleh API pengguna dan skrip CLI.
// Username: huruf kecil/angka/titik/minus/garis bawah, atau alamat email.
export const USERNAME_RE = /^(?=.{3,64}$)[a-z0-9._-]+(?:@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})?$/;
export const USERNAME_HINT = 'Username 3-64 karakter: huruf, angka, titik, minus, garis bawah, atau alamat email (tanpa spasi). Huruf kapital otomatis diubah menjadi huruf kecil';
// Spasi di ujung dan huruf kapital dirapikan dulu (seperti di menu Profil), supaya "Nama@Email.com " tidak ditolak.
export const normalizeUsername = (u: unknown) => String(u ?? '').trim().toLowerCase();
export const MIN_PASSWORD = 8;
export const MAX_NAME = 80;
export const cleanName = (n: unknown) => (typeof n === 'string' ? n.replace(/\s+/g, ' ').trim() : '');
