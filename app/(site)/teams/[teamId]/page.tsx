import { supabaseServer } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { TeamPageBuilder } from '@/app/components/team/TeamPageBuilder';
import { TeamHeader } from '@/app/components/team/TeamHeader';

interface TeamPageProps {
  params: {
    teamId: string;
  };
}

export default async function TeamPage({ params }: TeamPageProps) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Hole Team-Details
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('id', params.teamId)
    .single();

  if (!team) {
    redirect('/teams');
  }

  // Prüfe Mitgliedschaft
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*')
    .eq('team_id', params.teamId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    redirect('/teams');
  }

  // Hole Team-Konfiguration
  const { data: config } = await supabase
    .from('team_page_config')
    .select('*')
    .eq('team_id', params.teamId)
    .single();

  // Hole aktive Widgets
  const { data: widgets } = await supabase
    .from('team_widgets')
    .select('*')
    .eq('team_id', params.teamId)
    .eq('is_active', true)
    .order('position', { ascending: true });

  return (
    <div className="min-h-screen bg-gray-50">
      <TeamHeader 
        team={team} 
        membership={membership}
        config={config}
      />
      
      <main className="container mx-auto px-4 py-8">
        <TeamPageBuilder
          teamId={params.teamId}
          config={config}
          widgets={widgets || []}
          isTeamLeiter={membership.is_teamleiter}
        />
      </main>
    </div>
  );
}
