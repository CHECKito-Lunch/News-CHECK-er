'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Pin, Lock, MessageSquare, Send, Edit2, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
  raw_user_meta_data?: {
    full_name?: string;
    avatar_url?: string;
  };
}

interface Comment {
  id: number;
  thread_id: number;
  user_id: string;
  content: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
  author: User;
  children?: Comment[];
}

interface Thread {
  id: number;
  team_id: number;
  title: string;
  content: string;
  author_id: string;
  pinned: boolean;
  locked: boolean;
  created_at: string;
  updated_at: string;
  author: User;
}

interface PageProps {
  params: Promise<{ teamId: string; id: string }>;
}

export default function ThreadPage({ params }: PageProps) {
  const router = useRouter();
  const [teamId, setTeamId] = useState<string>('');
  const [threadId, setThreadId] = useState<string>('');
  const [thread, setThread] = useState<Thread | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    params.then(({ teamId, id }) => {
      setTeamId(teamId);
      setThreadId(id);
      loadThread(id);
    });
  }, [params]);

  const loadThread = async (id: string) => {
    try {
      const res = await fetch(`/api/teamhub/threadsQA?id=${id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Laden');
      }

      setThread(data.thread);
      setComments(data.comments || []);
    } catch (error) {
      console.error('Error loading thread:', error);
      alert(error instanceof Error ? error.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !threadId) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/teamhub/threads/${threadId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newComment.trim(),
          parent_id: replyTo
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Fehler beim Kommentieren');
      }

      setNewComment('');
      setReplyTo(null);
      await loadThread(threadId);
    } catch (error) {
      console.error('Error posting comment:', error);
      alert(error instanceof Error ? error.message : 'Fehler beim Kommentieren');
    } finally {
      setSubmitting(false);
    }
  };

  const getUserName = (user: User) => {
    return user.raw_user_meta_data?.full_name || user.email.split('@')[0];
  };

  const renderComment = (comment: Comment, depth = 0) => {
    const marginLeft = depth > 0 ? `${depth * 2}rem` : '0';

    return (
      <div key={comment.id} style={{ marginLeft }}>
        <Card className="p-4 mb-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-medium text-sm text-gray-900">
                {getUserName(comment.author)}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(comment.created_at).toLocaleString('de-DE')}
              </p>
            </div>
          </div>
          <p className="text-gray-700 whitespace-pre-wrap">{comment.content}</p>
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReplyTo(comment.id)}
              className="text-xs"
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              Antworten
            </Button>
          </div>
        </Card>
        {comment.children?.map((child) => renderComment(child, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-500">Lädt Thread...</p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-red-500">Thread nicht gefunden</p>
        <Link href={`/teams/${teamId}`}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <Link
          href={`/teams/${teamId}`}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Zurück zur Team-Seite
        </Link>
      </div>

      {/* Thread Header */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{thread.title}</h1>
              {thread.pinned && (
                <Pin className="h-5 w-5 text-blue-600" />
              )}
              {thread.locked && (
                <Lock className="h-5 w-5 text-gray-500" />
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">{getUserName(thread.author)}</span>
              <span>•</span>
              <span>{new Date(thread.created_at).toLocaleString('de-DE')}</span>
            </div>
          </div>
        </div>
        {thread.content && (
          <div className="prose max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap">{thread.content}</p>
          </div>
        )}
      </Card>

      {/* Comments Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Kommentare ({comments.length})
        </h2>
        {comments.length === 0 ? (
          <p className="text-gray-500 text-sm">Noch keine Kommentare. Sei der Erste!</p>
        ) : (
          <div>
            {comments.map((comment) => renderComment(comment))}
          </div>
        )}
      </div>

      {/* New Comment Form */}
      {!thread.locked && (
        <Card className="p-4">
          <form onSubmit={handleSubmitComment}>
            {replyTo && (
              <div className="mb-2 text-sm text-gray-600 flex items-center justify-between">
                <span>Antworte auf Kommentar #{replyTo}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyTo(null)}
                >
                  Abbrechen
                </Button>
              </div>
            )}
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Schreibe einen Kommentar..."
              rows={4}
              disabled={submitting}
              className="mb-3"
            />
            <Button
              type="submit"
              disabled={submitting || !newComment.trim()}
            >
              <Send className="h-4 w-4 mr-2" />
              {submitting ? 'Wird gesendet...' : 'Kommentar posten'}
            </Button>
          </form>
        </Card>
      )}

      {thread.locked && (
        <Card className="p-4 bg-gray-50">
          <div className="flex items-center gap-2 text-gray-600">
            <Lock className="h-5 w-5" />
            <p>Dieser Thread ist gesperrt. Keine neuen Kommentare möglich.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
