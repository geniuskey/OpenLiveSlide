const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit confusing 0/O/1/I

export function generateJoinCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function isValidJoinCode(code: string): boolean {
  return /^[A-Z2-9]{6}$/.test(code);
}
