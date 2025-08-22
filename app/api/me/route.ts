import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type Role = 'admin' | 'moderator' | 'user';

export async function GET() {
  const c = await cookies(); // 👈 wichtig

  const email = c.get('user_email')?.value ?? '';
  const name  = c.get('user_name')?.value || undefined;

  const roleRaw = c.get('user_role')?.value ?? '';
  const role: Role | undefined =
    roleRaw === 'admin' || roleRaw === 'moderator' || roleRaw === 'user'
      ? (roleRaw as Role)
      : undefined;

  if (!email || !role) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: { sub: email, role, name },
  });
}