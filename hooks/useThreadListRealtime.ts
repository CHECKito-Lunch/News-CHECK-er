/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UseThreadListRealtimeProps {
  teamId: string;
  onNewThread?: (thread: any) => void;
  onUpdateThread?: (thread: any) => void;
  onDeleteThread?: (threadId: number) => void;
}

export function useThreadListRealtime({
  teamId,
  onNewThread,
  onUpdateThread,
  onDeleteThread,
}: UseThreadListRealtimeProps) {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const supabase = createClient(); // ← KEIN await! Browser-Client ist synchron

    // Channel für Thread-Updates
    const channel = supabase
      .channel(`team-threads-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_threads',
          filter: `team_id=eq.${teamId}`,
        },
        async (payload) => {
          // Hole vollständige Thread-Daten mit Author
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

          if (thread && onNewThread) {
            onNewThread(thread);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'team_threads',
          filter: `team_id=eq.${teamId}`,
        },
        async (payload) => {
          if (onUpdateThread) {
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
              onUpdateThread(thread);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'team_threads',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          if (onDeleteThread) {
            onDeleteThread(payload.old.id);
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
  }, [teamId, onNewThread, onUpdateThread, onDeleteThread]);
}
