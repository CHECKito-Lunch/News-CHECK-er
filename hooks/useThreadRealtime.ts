/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UseThreadRealtimeProps {
  threadId: string;
  onNewComment?: (comment: any) => void;
  onUpdateComment?: (comment: any) => void;
  onDeleteComment?: (commentId: number) => void;
  onThreadUpdate?: (thread: any) => void;
}

export function useThreadRealtime({
  threadId,
  onNewComment,
  onUpdateComment,
  onDeleteComment,
  onThreadUpdate,
}: UseThreadRealtimeProps) {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const supabase = createClient(); // ← KEIN await!

    const channel = supabase
      .channel(`thread-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_thread_comments',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          if (onNewComment) {
            const { data: comment } = await supabase
              .from('team_thread_comments')
              .select(`
                *,
                author:users!team_thread_comments_user_id_fkey(
                  id,
                  email,
                  raw_user_meta_data
                )
              `)
              .eq('id', payload.new.id)
              .single();

            if (comment) {
              onNewComment(comment);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'team_thread_comments',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          if (onUpdateComment) {
            const { data: comment } = await supabase
              .from('team_thread_comments')
              .select(`
                *,
                author:users!team_thread_comments_user_id_fkey(
                  id,
                  email,
                  raw_user_meta_data
                )
              `)
              .eq('id', payload.new.id)
              .single();

            if (comment) {
              onUpdateComment(comment);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'team_thread_comments',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          if (onDeleteComment && payload.old?.id) {
            onDeleteComment(payload.old.id as number);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'team_threads',
          filter: `id=eq.${threadId}`,
        },
        async (payload) => {
          if (onThreadUpdate) {
            const { data: thread } = await supabase
              .from('team_threads')
              .select(`
                *,
                author:users!team_threads_author_id_fkey(
                  id,
                  email,
                  raw_user_meta_data
                )
              `)
              .eq('id', payload.new.id)
              .single();

            if (thread) {
              onThreadUpdate(thread);
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [threadId, onNewComment, onUpdateComment, onDeleteComment, onThreadUpdate]);
}
