/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState } from 'react';
import { useThreadRealtime } from '@/hooks/useThreadRealtime';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface ThreadViewProps {
  threadId: string;
  initialThread: any;
  initialComments: any[];
  currentUserId: string; // ← Hinzufügen
}

// Placeholder-Komponenten
function Comment({ comment }: { comment: any }) {
  return (
    <div className="p-4 border rounded">
      <p>{comment.content}</p>
    </div>
  );
}

function CommentForm({ threadId }: { threadId: string }) {
  return (
    <form className="mt-4">
      <textarea 
        className="w-full p-2 border rounded" 
        placeholder="Kommentar schreiben..."
      />
      <button className="mt-2 px-4 py-2 bg-blue-500 text-white rounded">
        Absenden
      </button>
    </form>
  );
}

function showNotification(message: string) {
  console.log('Notification:', message);
  // Toast-Notification hier implementieren
}

export function ThreadView({ 
  threadId, 
  initialThread, 
  initialComments,
  currentUserId 
}: ThreadViewProps) {
  const [thread, setThread] = useState(initialThread);
  const [comments, setComments] = useState(initialComments);

  useThreadRealtime({
    threadId,
    
    onNewComment: (newComment) => {
      setComments(prev => [...prev, newComment]);
      
      if (newComment.author.id !== currentUserId) {
        showNotification('Neuer Kommentar von ' + newComment.author.email);
      }
    },
    
    onUpdateComment: (updatedComment) => {
      setComments(prev =>
        prev.map(c =>
          c.id === updatedComment.id ? updatedComment : c
        )
      );
    },
    
    onDeleteComment: (commentId) => {
      setComments(prev => prev.filter(c => c.id !== commentId));
    },
    
    onThreadUpdate: (updatedThread) => {
      setThread(updatedThread);
      
      if (updatedThread.locked) {
        showNotification('Thread wurde gesperrt');
      }
    },
  });

  return (
    <div>
      <h1>{thread.title}</h1>
      {thread.pinned && <span className="badge">📌 Gepinnt</span>}
      {thread.locked && <span className="badge">🔒 Gesperrt</span>}
      
      <div className="content">{thread.content}</div>
      
      <div className="comments space-y-4 mt-6">
        {comments.map(comment => (
          <Comment key={comment.id} comment={comment} />
        ))}
      </div>
      
      {!thread.locked && <CommentForm threadId={threadId} />}
    </div>
  );
}
