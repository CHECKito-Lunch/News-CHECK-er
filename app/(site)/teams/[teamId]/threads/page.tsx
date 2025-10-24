'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Pin, Lock, Plus } from 'lucide-react';
import Link from 'next/link';

interface Thread {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

interface PageProps {
  params: Promise<{ teamId: string }>;
}

export default function ThreadsPage({ params }: PageProps) {
  const [teamId, setTeamId] = useState<string>('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ teamId }) => {
      setTeamId(teamId);
      loadThreads(teamId);
    });
  }, [params]);

  const loadThreads = async (teamId: string) => {
    try {
      const res = await fetch(`/api/teamhub/threads?team_id=${teamId}&limit=50`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Laden');
      }

      setThreads(data.threads || []);
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-500">Lädt Threads...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Diskussionen</h1>
        <Link href={`/teams/${teamId}/threads/new`}>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Neuer Thread
          </Button>
        </Link>
      </div>

      {threads.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Noch keine Diskussionen
          </h3>
          <p className="text-gray-500 mb-4">
            Starte die erste Diskussion in deinem Team
          </p>
          <Link href={`/teams/${teamId}/threads/new`}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Ersten Thread erstellen
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <Link key={thread.id} href={`/teams/${teamId}/threads/${thread.id}`}>
              <Card className="p-4 hover:border-blue-500 transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{thread.title}</h3>
                      {thread.pinned && (
                        <Pin className="h-4 w-4 text-blue-600" />
                      )}
                      {thread.locked && (
                        <Lock className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    {thread.content && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {thread.content}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(thread.created_at).toLocaleString('de-DE')}
                    </p>
                  </div>
                  <MessageSquare className="h-5 w-5 text-gray-400 ml-4" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
