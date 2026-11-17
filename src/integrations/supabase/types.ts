export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          answers: Json
          created_at: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          server_id: string
          status: string
          user_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          server_id: string
          status?: string
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          server_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          server_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          server_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_categories_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          kind: string
          name: string
          position: number
          server_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name: string
          position?: number
          server_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          position?: number
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "channel_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_group: boolean
          name: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_group?: boolean
          name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_group?: boolean
          name?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          channel_id: string | null
          created_at: string
          created_by: string
          duration_min: number
          id: string
          server_id: string
          starts_at: string
          title: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          created_by: string
          duration_min?: number
          id?: string
          server_id: string
          starts_at: string
          title: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          created_by?: string
          duration_min?: number
          id?: string
          server_id?: string
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string
          channel_id: string | null
          content: string
          conversation_id: string | null
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          channel_id?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          channel_id?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activity: string | null
          avatar_url: string | null
          banner_color: string | null
          banner_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          pronouns: string | null
          status: string
          updated_at: string
          username: string
        }
        Insert: {
          activity?: string | null
          avatar_url?: string | null
          banner_color?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id: string
          pronouns?: string | null
          status?: string
          updated_at?: string
          username: string
        }
        Update: {
          activity?: string | null
          avatar_url?: string | null
          banner_color?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          pronouns?: string | null
          status?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      server_members: {
        Row: {
          created_at: string
          id: string
          role: string
          server_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          server_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          server_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          access_questions: Json
          category: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          invite_code: string
          is_public: boolean
          looking_for: string[]
          name: string
          owner_id: string
          stage: string | null
          tagline: string | null
          website: string | null
        }
        Insert: {
          access_questions?: Json
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          invite_code?: string
          is_public?: boolean
          looking_for?: string[]
          name: string
          owner_id: string
          stage?: string | null
          tagline?: string | null
          website?: string | null
        }
        Update: {
          access_questions?: Json
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          invite_code?: string
          is_public?: boolean
          looking_for?: string[]
          name?: string
          owner_id?: string
          stage?: string | null
          tagline?: string | null
          website?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          notes: string | null
          server_id: string
          status: string
          title: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          notes?: string | null
          server_id: string
          status?: string
          title: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          server_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          server_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          server_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_states: {
        Row: {
          camera_on: boolean
          channel_id: string | null
          conversation_id: string | null
          deafened: boolean
          heartbeat_at: string
          joined_at: string
          muted: boolean
          sharing_screen: boolean
          user_id: string
        }
        Insert: {
          camera_on?: boolean
          channel_id?: string | null
          conversation_id?: string | null
          deafened?: boolean
          heartbeat_at?: string
          joined_at?: string
          muted?: boolean
          sharing_screen?: boolean
          user_id: string
        }
        Update: {
          camera_on?: boolean
          channel_id?: string | null
          conversation_id?: string | null
          deafened?: boolean
          heartbeat_at?: string
          joined_at?: string
          muted?: boolean
          sharing_screen?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_states_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          created_at: string
          email: string | null
          id: string
          invited_by: string
          responded_at: string | null
          role: string
          server_id: string
          status: string
          team_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          invited_by: string
          responded_at?: string | null
          role?: string
          server_id: string
          status?: string
          team_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string
          responded_at?: string | null
          role?: string
          server_id?: string
          status?: string
          team_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_access_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      discover_projects: {
        Args: { _category?: string; _limit?: number; _search?: string }
        Returns: {
          category: string
          cover_url: string
          created_at: string
          description: string
          icon_url: string
          id: string
          is_member: boolean
          looking_for: string[]
          member_count: number
          name: string
          request_status: string
          stage: string
          tagline: string
        }[]
      }
      discover_servers: {
        Args: { _limit?: number; _search?: string; _sort?: string }
        Returns: {
          created_at: string
          description: string
          icon_url: string
          id: string
          is_member: boolean
          member_count: number
          name: string
        }[]
      }
      get_project: {
        Args: { _id: string }
        Returns: {
          access_questions: Json
          category: string
          cover_url: string
          created_at: string
          description: string
          icon_url: string
          id: string
          is_member: boolean
          is_public: boolean
          looking_for: string[]
          member_count: number
          name: string
          owner_avatar: string
          owner_id: string
          owner_name: string
          request_status: string
          stage: string
          tagline: string
          website: string
        }[]
      }
      invite_to_workspace: {
        Args: {
          _identifier: string
          _role?: string
          _server_id: string
          _team_id?: string
        }
        Returns: {
          created_at: string
          email: string | null
          id: string
          invited_by: string
          responded_at: string | null
          role: string
          server_id: string
          status: string
          team_id: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_conversation_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_server_member: {
        Args: { _server_id: string; _user_id: string }
        Returns: boolean
      }
      is_workspace_admin: {
        Args: { _server_id: string; _user_id: string }
        Returns: boolean
      }
      join_server_by_invite: { Args: { _code: string }; Returns: string }
      remove_from_workspace: {
        Args: { _server_id: string; _user_id: string }
        Returns: undefined
      }
      request_access: {
        Args: { _answers?: Json; _message?: string; _server_id: string }
        Returns: {
          answers: Json
          created_at: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          server_id: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "access_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_invite: {
        Args: { _accept: boolean; _invite_id: string }
        Returns: string
      }
      review_access_request: {
        Args: { _approve: boolean; _request_id: string }
        Returns: string
      }
      set_workspace_role: {
        Args: { _role: string; _server_id: string; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
