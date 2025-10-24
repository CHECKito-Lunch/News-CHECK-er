/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Plus } from 'lucide-react';
import Link from 'next/link';

interface BoardWidgetProps {
  teamId: string;
  config: any;
  widgetId: string;
}

interface BoardItem {
  id: number;
  title: string;
  status: string;
  priority?: 'low' | 'medium' | 'high';
  assigned_to?: string;
}

interface Board {
  id: number;
  name: string;
  items: BoardItem[];
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-gray-500',
  medium: 'text-yellow-500',
  high: 'text-red-500',
};

export function BoardWidget({ teamId, config }: BoardWidgetProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);

  const boardId = config?.boardId;

  const fetchBoards = useCallback(async () => {
    try {
      const url = boardId
        ? `/api/teamhub/boards/${boardId}?team_id=${teamId}`
        : `/api/teamhub/boards?team_id=${teamId}&limit=1`;

      const res = await fetch(url);
      const data = await res.json();

      if (boardId) {
        setBoards(data.board ? [data.board] : []);
      } else {
        setBoards(data.boards || []);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Boards:', error);
    } finally {
      setLoading(false);
    }
  }, [teamId, boardId]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const board = boards[0];

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" />
          {board?.name || 'Board'}
        </CardTitle>
        {board && (
          <Button size="sm" asChild>
            <Link href={`/teams/${teamId}/boards/${board.id}`}>
              <Plus className="h-4 w-4 mr-2" />
              Task
            </Link>
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !board ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">Kein Board vorhanden</p>
            <Button size="sm" asChild>
              <Link href={`/teams/${teamId}/boards/new`}>
                Board erstellen
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Gruppiert nach Status */}
            {['todo', 'in-progress', 'done'].map((status) => {
              const items = board.items?.filter((item) => item.status === status) || [];
              if (items.length === 0) return null;

              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${STATUS_COLORS[status]}`}>
                      {status === 'todo' ? 'Offen' : status === 'in-progress' ? 'In Arbeit' : 'Erledigt'}
                    </span>
                    <span className="text-xs text-gray-500">({items.length})</span>
                  </div>

                  <div className="space-y-2">
                    {items.slice(0, 3).map((item) => (
                      <Link
                        key={item.id}
                        href={`/teams/${teamId}/boards/${board.id}/items/${item.id}`}
                        className="block p-3 rounded-lg border hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900 flex-1">
                            {item.title}
                          </span>
                          {item.priority && (
                            <span className={`text-xs ${PRIORITY_COLORS[item.priority]}`}>
                              {item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢'}
                            </span>
                          )}
                        </div>
                        {item.assigned_to && (
                          <span className="text-xs text-gray-500 mt-1 block">
                            👤 {item.assigned_to}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}

            <Button variant="outline" className="w-full mt-4" asChild>
              <Link href={`/teams/${teamId}/boards/${board.id}`}>
                Alle Tasks anzeigen
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </>
  );
}
