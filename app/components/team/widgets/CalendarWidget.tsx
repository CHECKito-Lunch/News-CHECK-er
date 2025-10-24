/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

interface CalendarWidgetProps {
  teamId: string;
  config: any;
  widgetId: string;
}

export function CalendarWidget({ teamId, config }: CalendarWidgetProps) {
  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Kalender
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-500">Kalender Widget - Coming soon</p>
      </CardContent>
    </>
  );
}
