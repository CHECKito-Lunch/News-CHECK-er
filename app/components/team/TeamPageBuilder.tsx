/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { WidgetRenderer } from '../team/WidgetRenderer';
import { AddWidgetDialog } from '../team/widgets/AddWidgetDialog';

interface TeamPageBuilderProps {
  teamId: string;
  config: any;
  widgets: any[];
  isTeamLeiter: boolean;
}

export function TeamPageBuilder({
  teamId,
  config,
  widgets: initialWidgets,
  isTeamLeiter
}: TeamPageBuilderProps) {
  const [widgets, setWidgets] = useState(initialWidgets);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = widgets.findIndex(w => w.id === active.id);
    const newIndex = widgets.findIndex(w => w.id === over.id);

    // Reorder widgets
    const reorderedWidgets = [...widgets];
    const [movedWidget] = reorderedWidgets.splice(oldIndex, 1);
    reorderedWidgets.splice(newIndex, 0, movedWidget);

    // Update positions
    const updatedWidgets = reorderedWidgets.map((w, idx) => ({
      ...w,
      position: idx * 1000
    }));

    setWidgets(updatedWidgets);

    // Save to backend
    await saveWidgetOrder(updatedWidgets);
  };

  const saveWidgetOrder = async (reorderedWidgets: any[]) => {
    try {
      const updates = reorderedWidgets.map(w => ({
        id: w.id,
        position: w.position
      }));

      await fetch(`/api/teamhub/widgets/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: updates })
      });
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    }
  };

  const layout = config?.layout || { sections: [] };

  return (
    <div className="space-y-6">
      {/* Edit Mode Toggle (nur für Teamleiter) */}
      {isTeamLeiter && (
        <div className="flex items-center justify-between bg-white p-4 rounded-lg border">
          <div className="flex items-center gap-3">
            <Button
              variant={isEditMode ? 'default' : 'outline'}
              onClick={() => setIsEditMode(!isEditMode)}
            >
              {isEditMode ? 'Bearbeitungsmodus beenden' : 'Seite bearbeiten'}
            </Button>
            {isEditMode && (
              <Button
                variant="outline"
                onClick={() => setShowAddWidget(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Widget hinzufügen
              </Button>
            )}
          </div>
          {isEditMode && (
            <span className="text-sm text-muted-foreground">
              Ziehen Sie Widgets, um sie neu anzuordnen
            </span>
          )}
        </div>
      )}

      {/* Widget Grid */}
      {isEditMode ? (
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={widgets.map(w => w.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {widgets.map((widget) => (
                <WidgetRenderer
                  key={widget.id}
                  widget={widget}
                  teamId={teamId}
                  isEditMode={isEditMode}
                  onRemove={(id) => {
                    setWidgets(widgets.filter(w => w.id !== id));
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {widgets.map((widget) => (
            <WidgetRenderer
              key={widget.id}
              widget={widget}
              teamId={teamId}
              isEditMode={false}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {widgets.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border">
          <div className="text-gray-400 mb-4">
            <Plus className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Noch keine Widgets
          </h3>
          <p className="text-gray-500 mb-4">
            {isTeamLeiter 
              ? 'Fügen Sie Widgets hinzu, um Ihre Team-Seite zu gestalten'
              : 'Der Teamleiter hat noch keine Widgets hinzugefügt'}
          </p>
          {isTeamLeiter && (
            <Button onClick={() => setShowAddWidget(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Erstes Widget hinzufügen
            </Button>
          )}
        </div>
      )}

      {/* Add Widget Dialog */}
      {showAddWidget && (
        <AddWidgetDialog
          teamId={teamId}
          open={showAddWidget}
          onClose={() => setShowAddWidget(false)}
          onAdd={(newWidget) => {
            setWidgets([...widgets, newWidget]);
            setShowAddWidget(false);
          }}
        />
      )}
    </div>
  );
}
