/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Megaphone, Plus, Pin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import Link from 'next/link';

interface AnnouncementWidgetProps {
  teamId: string;
  config: any;
  widgetId: string;
}

interface Announcement {
  id: number;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'urgent';
  pinned: boolean;
  created_at: string;
  author?: {
    id: string;
    email: string;
    raw_user_meta_data?: {
      full_name?: string;
    };
  };
}

const TYPE_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  info: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'ℹ️' },
  warning: { bg: 'bg-yellow-50', text: 'text-yellow-700', icon: '⚠️' },
  success: { bg: 'bg-green-50', text: 'text-green-700', icon: '✅' },
  urgent: { bg: 'bg-red-50', text: 'text-red-700', icon: '🚨' },
};

export function AnnouncementWidget({ teamId, config }: AnnouncementWidgetProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const limit = (config?.limit as number) || 3;

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/teamhub/threads?team_id=${teamId}&pinned=true&limit=${limit}`
      );
      const data = await res.json();
      setAnnouncements(data.threads || []);
    } catch (error) {
      console.error('Fehler beim Laden der Ankündigungen:', error);
    } finally {
      setLoading(false);
    }
  }, [teamId, limit]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Wichtige Ankündigungen
        </CardTitle>
        <Button size="sm" asChild>
          <Link href={`/teams/${teamId}/threads/new?pinned=true`}>
            <Plus className="h-4 w-4 mr-2" />
            Neu
          </Link>
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Keine Ankündigungen
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => {
              const type = (announcement as any).announcement_type || 'info';
              const style = TYPE_STYLES[type] || TYPE_STYLES.info;

              return (
                <Link
                  key={announcement.id}
                  href={`/teams/${teamId}/threads/${announcement.id}`}
                  className={`block p-4 rounded-lg border-2 ${style.bg} border-transparent hover:border-gray-300 transition-colors`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{style.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className={`font-semibold ${style.text}`}>
                          {announcement.title}
                        </h4>
                        {announcement.pinned && (
                          <Pin className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                        {announcement.content}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>
                          {announcement.author?.raw_user_meta_data?.full_name ||
                            announcement.author?.email?.split('@')[0] ||
                            'Unbekannt'}
                        </span>
                        <span>•</span>
                        <span>
                          {formatDistanceToNow(new Date(announcement.created_at), {
                            addSuffix: true,
                            locale: de,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {announcements.length > 0 && (
          <Button variant="outline" className="w-full mt-4" asChild>
            <Link href={`/teams/${teamId}/threads?pinned=true`}>
              Alle Ankündigungen anzeigen
            </Link>
          </Button>
        )}
      </CardContent>
    </>
  );
}
