export interface Team {
  id: number;
  name: string;
  description?: string;
}

export interface Membership {
  user_id: string;
  team_id: number;
  is_teamleiter: boolean;
}

export interface TeamConfig {
  layout?: {
    sections: Array<{
      id: string;
      widgets: Array<{
        type: string;
        config: Record<string, unknown>;
      }>;
    }>;
  };
  theme?: {
    primary_color?: string;
    logo_url?: string;
    show_badges?: boolean;
  };
}

export interface Widget {
  id: string;
  team_id: number;
  widget_type: string;
  config: Record<string, unknown>;
  position: number;
  is_active: boolean;
}
