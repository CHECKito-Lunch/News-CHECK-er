'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Pin } from 'lucide-react';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface PageProps {
  params: Promise<{ teamId: string }>;
}

export default function NewThreadPage({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [teamId, setTeamId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isTeamleiter, setIsTeamleiter] = useState(false);

  useEffect(() => {
    params.then(({ teamId }) => {
      setTeamId(teamId);
      // Check if pinned query param is present
      if (searchParams.get('pinned') === 'true') {
        setPinned(true);
      }
      // Check if user is teamleiter
      checkTeamleiterStatus(teamId);
    });
  }, [params, searchParams]);

  const checkTeamleiterStatus = async (teamId: string) => {
    try {
      const res = await fetch(`/api/teamhub/teams/${teamId}`);
      const { data } = await res.json();
      setIsTeamleiter(data?.is_teamleiter || false);
    } catch (error) {
      console.error('Error checking teamleiter status:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/teamhub/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          title: title.trim(),
          content: content.trim(),
          pinned: isTeamleiter ? pinned : false
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Fehler beim Erstellen');
      }

      const { data } = await res.json();
      router.push(`/teams/${teamId}/threads/${data.id}`);
    } catch (error) {
      console.error('Error creating thread:', error);
      alert(error instanceof Error ? error.message : 'Fehler beim Erstellen');
    } finally {
      setLoading(false);
    }
  };

  if (!teamId) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-gray-500">Laden...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <Link
          href={`/teams/${teamId}`}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Zurück zur Team-Seite
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Neuer Thread
        </h1>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Titel
            </Label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Thread-Titel eingeben..."
              required
              className="w-full"
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
              Inhalt (optional)
            </Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Beschreibung oder Kontext hinzufügen..."
              rows={8}
              className="w-full"
              disabled={loading}
            />
          </div>

          {isTeamleiter && (
            <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg">
              <Checkbox
                id="pinned"
                checked={pinned}
                onCheckedChange={(checked) => setPinned(checked as boolean)}
                disabled={loading}
              />
              <Label
                htmlFor="pinned"
                className="text-sm font-medium text-gray-700 cursor-pointer flex items-center"
              >
                <Pin className="h-4 w-4 mr-1 text-blue-600" />
                Als Ankündigung anheften
              </Label>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex-1"
            >
              {loading ? 'Erstelle...' : 'Thread erstellen'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              Abbrechen
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
