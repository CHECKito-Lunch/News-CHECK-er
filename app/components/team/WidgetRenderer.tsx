/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, X, Settings } from 'lucide-react';
import { ThreadWidget } from './widgets/ThreadWidget';
import { PollWidget } from './widgets/PollWidget';
import { BoardWidget } from './widgets/BoardWidget';
import { AnnouncementWidget } from './widgets/AnnouncementWidget';
import { MembersWidget } from './widgets/MembersWidget';
import { CalendarWidget } from './widgets/CalendarWidget';

interface WidgetRendererProps {
  widget: any;
  teamId: string;
  isEditMode: boolean;
  onRemove?: (id: string) => void;
}

export function WidgetRenderer({
  widget,
  teamId,
  isEditMode,
  onRemove
}: WidgetRendererProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Widget-Typ zu Komponente Mapping
  const widgetComponents: Record<string, any> = {
    threads: ThreadWidget,
    poll: PollWidget,
    board: BoardWidget,
    announcement: AnnouncementWidget,
    members: MembersWidget,
    calendar: CalendarWidget,
  };

  const WidgetComponent = widgetComponents[widget.widget_type];

  if (!WidgetComponent) {
    return (
      <div className="col-span-full">
        <Card className="p-4 text-center text-red-500">
          Unbekannter Widget-Typ: {widget.widget_type}
        </Card>
      </div>
    );
  }

  // Grid-Spalten basierend auf Widget-Config
  const colSpan = widget.config?.colSpan || 12;
  const gridClass = `lg:col-span-${colSpan}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${gridClass} col-span-full`}
      {...attributes}
    >
      <Card className={`relative ${isEditMode ? 'ring-2 ring-blue-200' : ''}`}>
        {/* Edit Mode Controls */}
        {isEditMode && (
          <div className="absolute top-2 right-2 flex gap-2 z-10">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 cursor-grab"
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-red-500 hover:text-red-600"
              onClick={() => onRemove?.(widget.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Widget Content */}
        <WidgetComponent
          teamId={teamId}
          config={widget.config}
          widgetId={widget.id}
        />
      </Card>
    </div>
  );
}
