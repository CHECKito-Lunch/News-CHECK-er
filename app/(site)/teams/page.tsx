import { supabaseServer } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Users, Plus } from 'lucide-react';

export default async function TeamsPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Hole alle Teams des Users
  const { data: teams } = await supabase
    .from('team_memberships')
    .select(`
      *,
      team:teams(*)
    `)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Meine Teams</h1>
          <Link
            href="/teams/create"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-5 w-5" />
            Neues Team
          </Link>
        </div>

        {!teams || teams.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              Noch keine Teams
            </h3>
            <p className="text-gray-500 mb-6">
              Erstelle dein erstes Team oder warte auf eine Einladung
            </p>
            <Link
              href="/teams/create"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-5 w-5" />
              Team erstellen
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((membership) => (
              <Link
                key={membership.id}
                href={`/team/${membership.team.id}`}
                className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-1">
                      {membership.team.name}
                    </h3>
                    {membership.team.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
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
                
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Users className="h-4 w-4" />
                  <span>Mitglied seit {new Date(membership.joined_at).toLocaleDateString('de-DE')}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
