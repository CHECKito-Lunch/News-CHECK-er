'use client';

import { useEffect, useState, useCallback } from 'react';
import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import Link from 'next/link';

interface ThreadWidgetProps {
  teamId: string;
  config: Record<string, unknown>;
  widgetId: string;
}

interface Thread {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  author?: {
    id: string;
    email: string;
    raw_user_meta_data?: {
      full_name?: string;
      avatar_url?: string;
    };
  };
  comment_count?: Array<{ count: number }>;
}

export function ThreadWidget({ teamId, config }: ThreadWidgetProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const limit = (config?.limit as number) || 5;

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/teamhub/threads?team_id=${teamId}&limit=${limit}`
      );
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (error) {
      console.error('Fehler beim Laden der Threads:', error);
    } finally {
      setLoading(false);
    }
  }, [teamId, limit]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Diskussionen
        </CardTitle>
        <Button size="sm" asChild>
          <Link href={`/teams/${teamId}/threads/new`}>
            <Plus className="h-4 w-4 mr-2" />
            Neu
          </Link>
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Noch keine Diskussionen
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/teams/${teamId}/threads/${thread.id}`}
                className="block p-4 rounded-lg hover:bg-gray-50 transition-colors border"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {thread.pinned && (
                        <span className="text-yellow-500">📌</span>
                      )}
                      <h4 className="font-medium text-gray-900 truncate">
                        {thread.title}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      <span>
                        {thread.author?.raw_user_meta_data?.full_name || 
                         thread.author?.email?.split('@')[0] || 
                         'Unbekannt'}
                      </span>
                      <span>•</span>
                      <span>
                        {formatDistanceToNow(new Date(thread.created_at), {
                          addSuffix: true,
                          locale: de
                        })}
                      </span>
                      {thread.comment_count && thread.comment_count[0]?.count > 0 && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {thread.comment_count[0].count}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-4">
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/teams/${teamId}/threads`}>
              Alle Diskussionen anzeigen
            </Link>
          </Button>
        </div>
      </CardContent>
    </>
  );
}
