import * as bcrypt from 'bcrypt';

const saltRounds = 10;

export async function hashToken(token: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  return await bcrypt.hash(token, saltRounds);
}

export async function compareToken(
  token: string,
  hash: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  return await bcrypt.compare(token, hash);
}
