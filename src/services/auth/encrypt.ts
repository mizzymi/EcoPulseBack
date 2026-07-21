import { hash } from 'bcryptjs';

export async function encrypt(value: string): Promise<string> {
  if (!value) throw new Error('Value required for hashing');

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? '12');
  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
    throw new Error('BCRYPT_ROUNDS must be an integer between 10 and 15');
  }

  return hash(value, rounds);
}
