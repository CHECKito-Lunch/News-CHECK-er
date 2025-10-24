/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Crown, Mail, UserPlus } from 'lucide-react';
import Link from 'next/link';

interface MembersWidgetProps {
  teamId: string;
  config: any;
  widgetId: string;
}

interface Member {
  user_id: string;
  is_teamleiter: boolean;
  active: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
    raw_user_meta_data?: {
      full_name?: string;
      avatar_url?: string;
    };
  };
}

export function MembersWidget({ teamId, config }: MembersWidgetProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const layout = (config?.layout as 'grid' | 'list') || 'grid';

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/teamhub/members?team_id=${teamId}`);
      const data = await res.json();
      setMembers(data.members || []);
    } catch (error) {
      console.error('Fehler beim Laden der Mitglieder:', error);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email?.substring(0, 2).toUpperCase() || '??';
  };

  const getDisplayName = (member: Member) => {
    return (
      member.user?.raw_user_meta_data?.full_name ||
      member.user?.name ||
      member.user?.email?.split('@')[0] ||
      'Unbekannt'
    );
  };

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Team-Mitglieder
          <span className="text-sm font-normal text-gray-500">
            ({members.filter(m => m.active).length})
          </span>
        </CardTitle>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/teams/${teamId}/members`}>
            <UserPlus className="h-4 w-4 mr-2" />
            Verwalten
          </Link>
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className={layout === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-2'}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Keine Mitglieder
          </div>
        ) : layout === 'grid' ? (
          <div className="grid grid-cols-2 gap-3">
            {members
              .filter((m) => m.active)
              .map((member) => {
                const displayName = getDisplayName(member);
                const initials = getInitials(
                  member.user?.raw_user_meta_data?.full_name || member.user?.name,
                  member.user?.email
                );

                return (
                  <div
                    key={member.user_id}
                    className="flex flex-col items-center p-3 rounded-lg border bg-white hover:border-blue-300 transition-colors"
                  >
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                        {initials}
                      </div>
                      {member.is_teamleiter && (
                        <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1">
                          <Crown className="h-3 w-3 text-yellow-900" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-gray-900 mt-2 text-center line-clamp-1">
                      {displayName}
                    </span>
                    {member.is_teamleiter && (
                      <span className="text-[10px] text-yellow-600 font-medium">
                        Teamleiter
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="space-y-2">
            {members
              .filter((m) => m.active)
              .map((member) => {
                const displayName = getDisplayName(member);
                const initials = getInitials(
                  member.user?.raw_user_meta_data?.full_name || member.user?.name,
                  member.user?.email
                );

                return (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:border-blue-300 transition-colors"
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-xs">
                        {initials}
                      </div>
                      {member.is_teamleiter && (
                        <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-0.5">
                          <Crown className="h-3 w-3 text-yellow-900" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {displayName}
                        </span>
                        {member.is_teamleiter && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                            Teamleiter
                          </span>
                        )}
                      </div>
                      {member.user?.email && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{member.user.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </>
  );
}
