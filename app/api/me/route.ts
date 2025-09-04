// app/api/me/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type Role = 'admin' | 'moderator' | 'user';
type Me = { user: { sub: string; role: Role; name?: string } | null };

export async function GET() {
  // In deiner Next-Version ist cookies() async -> await!
  const c = await cookies();

  const role = c.get('user_role')?.value as Role | undefined;

  // Wenn kein user_role-Cookie: nicht eingeloggt
  if (!role) {
    return NextResponse.json<Me>({ user: null });
  }

  // Wir kennen hier nur die Rolle zuverlässig (ohne weitere Session-Dekodierung)
  // sub/name kannst du später anreichern, wenn du eine Server-Session verwendest.
  return NextResponse.json<Me>({
    user: {
      sub: 'unknown', // optional: durch echte User-ID ersetzen, wenn verfügbar
      role,
    },
  });
}
