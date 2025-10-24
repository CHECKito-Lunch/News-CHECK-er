/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Plus } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';

interface PollWidgetProps {
  teamId: string;
  config: any;
  widgetId: string;
}

export function PollWidget({ teamId, config }: PollWidgetProps) {
  const [polls, setPolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPolls();
  }, [teamId]);

  const fetchPolls = async () => {
    try {
      const res = await fetch(
        `/api/teamhub/polls?team_id=${teamId}&status=active`
      );
      const data = await res.json();
      setPolls(data.polls || []);
    } catch (error) {
      console.error('Fehler beim Laden der Polls:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (pollId: number, optionId: number) => {
    try {
      await fetch(`/api/teamhub/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_ids: [optionId] })
      });
      fetchPolls(); // Reload
    } catch (error) {
      console.error('Fehler beim Abstimmen:', error);
    }
  };

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Aktuelle Umfragen
        </CardTitle>
        <Button size="sm" asChild>
          <Link href={`/team/${teamId}/polls/new`}>
            <Plus className="h-4 w-4 mr-2" />
            Neu
          </Link>
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : polls.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Keine aktiven Umfragen
          </div>
        ) : (
          <div className="space-y-6">
            {polls.slice(0, config?.limit || 3).map((poll) => (
              <div key={poll.id} className="p-4 border rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">
                  {poll.question}
                </h4>

                <div className="space-y-2">
                  {poll.options?.map((option: any) => (
                    <div key={option.id}>
                      {poll.user_has_voted ? (
                        <div>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>{option.option_text}</span>
                            <span className="font-medium">
                              {option.percentage}%
                            </span>
                          </div>
                          <Progress value={option.percentage} />
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => handleVote(poll.id, option.id)}
                        >
                          {option.option_text}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-3 text-sm text-gray-500">
                  {poll.total_votes} Stimme{poll.total_votes !== 1 && 'n'}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </>
  );
}
