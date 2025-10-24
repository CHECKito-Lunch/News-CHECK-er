import { supabaseServer } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function TeamsPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // FIX: assigned_at statt joined_at verwenden!
  const { data: teams } = await supabase
    .from('team_memberships')
    .select('*, team:teams(*)')
    .eq('user_id', user.id)
    .eq('active', true) // ← Nur aktive Mitgliedschaften
    .order('assigned_at', { ascending: false }); // ← assigned_at statt joined_at

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Meine Teams</h1>
          <Link
            href="/teams/create"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Neues Team
          </Link>
        </div>

        {!teams || teams.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg">
            <p className="text-xl text-gray-700 mb-2">Noch keine Teams</p>
            <p className="text-gray-500 mb-6">
              Erstelle dein erstes Team oder warte auf eine Einladung
            </p>
            <Link
              href="/teams/create"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Team erstellen
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((membership) => (
              <Link
                key={membership.team_id}
                href={`/teams/${membership.team_id}`}
                className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-1">
                      {membership.team.name}
                    </h3>
                    {membership.team.description && (
                      <p className="text-sm text-gray-600">
                        {membership.team.description}
                      </p>
                    )}
                  </div>
                  {membership.is_teamleiter && (
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      Leiter
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-gray-500">
                  Mitglied seit {new Date(membership.assigned_at).toLocaleDateString('de-DE')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
