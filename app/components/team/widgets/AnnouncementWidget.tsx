/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Megaphone } from 'lucide-react';

interface AnnouncementWidgetProps {
  teamId: string;
  config: any;
  widgetId: string;
}

export function AnnouncementWidget({ teamId, config }: AnnouncementWidgetProps) {
  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Ankündigungen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-500">Ankündigungen Widget - Coming soon</p>
      </CardContent>
    </>
  );
}
