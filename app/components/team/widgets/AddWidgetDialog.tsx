/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  MessageSquare,
  BarChart3,
  LayoutGrid,
  Megaphone,
  Users,
  Calendar
} from 'lucide-react';

interface AddWidgetDialogProps {
  teamId: string;
  open: boolean;
  onClose: () => void;
  onAdd: (widget: any) => void;
}

const WIDGET_TYPES = [
  {
    type: 'threads',
    name: 'Diskussionen',
    description: 'Zeige neueste Threads und Diskussionen',
    icon: MessageSquare,
    defaultConfig: { limit: 5, colSpan: 8 }
  },
  {
    type: 'poll',
    name: 'Umfragen',
    description: 'Aktive Team-Umfragen anzeigen',
    icon: BarChart3,
    defaultConfig: { limit: 2, colSpan: 4 }
  },
  {
    type: 'board',
    name: 'Board',
    description: 'Kanban-Board für Task-Management',
    icon: LayoutGrid,
    defaultConfig: { boardId: null, colSpan: 12 }
  },
  {
    type: 'announcement',
    name: 'Ankündigungen',
    description: 'Wichtige Team-Ankündigungen',
    icon: Megaphone,
    defaultConfig: { limit: 3, colSpan: 6 }
  },
  {
    type: 'members',
    name: 'Team-Mitglieder',
    description: 'Zeige alle Team-Mitglieder',
    icon: Users,
    defaultConfig: { layout: 'grid', colSpan: 4 }
  },
  {
    type: 'calendar',
    name: 'Kalender',
    description: 'Kommende Team-Events',
    icon: Calendar,
    defaultConfig: { daysAhead: 14, colSpan: 6 }
  }
];

export function AddWidgetDialog({
  teamId,
  open,
  onClose,
  onAdd
}: AddWidgetDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleAddWidget = async (widgetType: any) => {
    setLoading(true);
    try {
      const res = await fetch('/api/teamhub/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          widget_type: widgetType.type,
          config: widgetType.defaultConfig,
          position: Math.floor(Date.now() / 1000) // Unix timestamp in seconds (fits in INTEGER)
        })
      });

      const { data } = await res.json();
      onAdd(data);
    } catch (error) {
      console.error('Fehler beim Hinzufügen:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Widget hinzufügen</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-4">
          {WIDGET_TYPES.map((widgetType) => {
            const Icon = widgetType.icon;
            return (
              <Card
                key={widgetType.type}
                className="p-4 cursor-pointer hover:border-blue-500 transition-colors"
                onClick={() => handleAddWidget(widgetType)}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 mb-1">
                      {widgetType.name}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {widgetType.description}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
