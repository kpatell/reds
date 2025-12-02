export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          avatar_url: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          username?: string | null
          avatar_url?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          username?: string | null
          avatar_url?: string | null
          updated_at?: string | null
        }
      }
      games: {
        Row: {
          id: string
          created_at: string
          status: 'waiting' | 'playing' | 'finished'
          deck: Json
          discard_pile: Json
          current_turn_player_id: string | null
          turn_phase: string
          drawn_card: Json | null
          players: Json
          last_action_at: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          status?: 'waiting' | 'playing' | 'finished'
          deck?: Json
          discard_pile?: Json
          current_turn_player_id?: string | null
          turn_phase?: string
          drawn_card?: Json | null
          players?: Json
          last_action_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          status?: 'waiting' | 'playing' | 'finished'
          deck?: Json
          discard_pile?: Json
          current_turn_player_id?: string | null
          turn_phase?: string
          drawn_card?: Json | null
          players?: Json
          last_action_at?: string | null
        }
      }
    }
  }
}
