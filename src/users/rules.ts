// Aturan akun yang dipakai bersama oleh API pengguna dan skrip CLI.
// Username: huruf kecil/angka/titik/minus/garis bawah, atau alamat email.
export const USERNAME_RE = /^(?=.{3,64}$)[a-z0-9._-]+(?:@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})?$/;
export const USERNAME_HINT = 'Username 3-64 karakter: huruf kecil, angka, titik, minus, garis bawah, atau alamat email';
export const MIN_PASSWORD = 8;
