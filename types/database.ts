// Run `supabase gen types typescript --project-id <ref> > types/database.ts`
// after creating your Supabase project to replace this file with generated types.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string
          is_admin: boolean
          telegram_chat_id: string | null
          chart_color: string | null
          clan: 'Beeläiset' | 'Ceeläiset' | 'Independents' | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          display_name: string
          is_admin?: boolean
          telegram_chat_id?: string | null
          chart_color?: string | null
          clan?: 'Beeläiset' | 'Ceeläiset' | 'Independents' | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string
          is_admin?: boolean
          telegram_chat_id?: string | null
          chart_color?: string | null
          clan?: 'Beeläiset' | 'Ceeläiset' | 'Independents' | null
          created_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: number
          external_id: number
          stage: string
          group_name: string | null
          match_day: number | null
          home_team: string
          away_team: string
          kickoff_at: string
          status: string
          home_score: number | null
          away_score: number | null
          result_confirmed_at: string | null
          reminder_sent: boolean
          kickoff_msg_sent: boolean
          af_fixture_id: number | null
          home_xg: number | null
          away_xg: number | null
          created_at: string
        }
        Insert: {
          id?: number
          external_id: number
          stage: string
          group_name?: string | null
          match_day?: number | null
          home_team: string
          away_team: string
          kickoff_at: string
          status?: string
          home_score?: number | null
          away_score?: number | null
          result_confirmed_at?: string | null
          reminder_sent?: boolean
          kickoff_msg_sent?: boolean
          af_fixture_id?: number | null
          home_xg?: number | null
          away_xg?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          external_id?: number
          stage?: string
          group_name?: string | null
          match_day?: number | null
          home_team?: string
          away_team?: string
          kickoff_at?: string
          status?: string
          home_score?: number | null
          away_score?: number | null
          result_confirmed_at?: string | null
          reminder_sent?: boolean
          kickoff_msg_sent?: boolean
          af_fixture_id?: number | null
          home_xg?: number | null
          away_xg?: number | null
          created_at?: string
        }
        Relationships: []
      }
      predictions: {
        Row: {
          id: number
          user_id: string
          match_id: number
          home_score_pred: number
          away_score_pred: number
          points: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id: string
          match_id: number
          home_score_pred: number
          away_score_pred: number
          points?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          match_id?: number
          home_score_pred?: number
          away_score_pred?: number
          points?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          }
        ]
      }
      scoring_log: {
        Row: {
          id: number
          match_id: number
          user_id: string
          points: number
          breakdown: Json
          scored_at: string
        }
        Insert: {
          id?: number
          match_id: number
          user_id: string
          points: number
          breakdown: Json
          scored_at?: string
        }
        Update: {
          id?: number
          match_id?: number
          user_id?: string
          points?: number
          breakdown?: Json
          scored_at?: string
        }
        Relationships: []
      }
      category_bets: {
        Row: {
          id: number
          user_id: string
          category: string
          bet_value: string
          points: number | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          category: string
          bet_value: string
          points?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          category?: string
          bet_value?: string
          points?: number | null
          created_at?: string
        }
        Relationships: []
      }
      category_results: {
        Row: {
          id: number
          category: string
          result_value: string
          created_at: string
        }
        Insert: {
          id?: number
          category: string
          result_value: string
          created_at?: string
        }
        Update: {
          id?: number
          category?: string
          result_value?: string
          created_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: number
          user_id: string
          message: string
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          message: string
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          message?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
  }
}
