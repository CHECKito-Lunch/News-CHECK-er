/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';

interface MembersWidgetProps {
  teamId: string;
  config: any;
  widgetId: string;
}

export function MembersWidget({ teamId, config }: MembersWidgetProps) {
  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Team-Mitglieder
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-500">Mitglieder Widget - Coming soon</p>
      </CardContent>
    </>
  );
}
