/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LayoutGrid } from 'lucide-react';

interface BoardWidgetProps {
  teamId: string;
  config: any;
  widgetId: string;
}

export function BoardWidget({ teamId, config }: BoardWidgetProps) {
  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" />
          Board
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-500">Board Widget - Coming soon</p>
      </CardContent>
    </>
  );
}
