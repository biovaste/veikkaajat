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
          created_at: string
        }
        Insert: {
          id: string
          email: string
          display_name: string
          is_admin?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string
          is_admin?: boolean
          created_at?: string
        }
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
          created_at?: string
        }
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
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
