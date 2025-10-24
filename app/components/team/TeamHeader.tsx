/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Users, 
  Bell, 
  MoreVertical 
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TeamHeaderProps {
  team: any;
  membership: any;
  config: any;
}

export function TeamHeader({ team, membership, config }: TeamHeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  
  const theme = config?.theme || {};
  const primaryColor = theme.primary_color || '#3b82f6';

  return (
    <header 
      className="bg-white border-b shadow-sm"
      style={{ borderTopColor: primaryColor, borderTopWidth: '4px' }}
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Team Info */}
          <div className="flex items-center gap-4">
            {theme.logo_url && (
              <img 
                src={theme.logo_url} 
                alt={team.name}
                className="h-12 w-12 rounded-lg object-cover"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {team.name}
              </h1>
              {team.description && (
                <p className="text-sm text-gray-500">
                  {team.description}
                </p>
              )}
            </div>
            {membership.is_teamleiter && (
              <Badge variant="secondary">Teamleiter</Badge>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon">
              <Users className="h-5 w-5" />
            </Button>

            {membership.is_teamleiter && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-5 w-5" />
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Team verlassen</DropdownMenuItem>
                <DropdownMenuItem>Benachrichtigungen</DropdownMenuItem>
                {membership.is_teamleiter && (
                  <DropdownMenuItem>Team-Einstellungen</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
