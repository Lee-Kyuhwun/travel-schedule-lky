
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "checklist_items": {
                  Row: {
                    "created_at": string,"done": boolean,"id": string,"position": number,"text": string,"trip_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"done"?: boolean,"id"?: string,"position": number,"text": string,"trip_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"done"?: boolean,"id"?: string,"position"?: number,"text"?: string,"trip_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checklist_items_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"collection_places": {
                  Row: {
                    "collection_id": string,"created_at": string,"saved_place_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "collection_id": string,"created_at"?: string,"saved_place_id": string
                  }
                  Update: {
                    "collection_id"?: string,"created_at"?: string,"saved_place_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_places_collection_id_fkey"
      columns: ["collection_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_places_saved_place_id_fkey"
      columns: ["saved_place_id"]
isOneToOne: false
      referencedRelation: "saved_places"
      referencedColumns: ["id"]
    }
                  ]
                },"collections": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"position": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"id": string,"position": number,"spent_on": string,"title": string,"trip_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"currency": string,"id"?: string,"position": number,"spent_on": string,"title": string,"trip_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"position"?: number,"spent_on"?: string,"title"?: string,"trip_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"flights": {
                  Row: {
                    "arr_date": string,"arr_time": string,"created_at": string,"dep_date": string,"dep_time": string,"flight_no": string,"from_code": string,"id": string,"position": number,"to_code": string,"trip_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "arr_date": string,"arr_time": string,"created_at"?: string,"dep_date": string,"dep_time": string,"flight_no": string,"from_code": string,"id"?: string,"position": number,"to_code": string,"trip_id": string,"updated_at"?: string
                  }
                  Update: {
                    "arr_date"?: string,"arr_time"?: string,"created_at"?: string,"dep_date"?: string,"dep_time"?: string,"flight_no"?: string,"from_code"?: string,"id"?: string,"position"?: number,"to_code"?: string,"trip_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flights_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"itinerary_items": {
                  Row: {
                    "alias": string | null,"created_at": string,"day_index": number,"id": string,"kind": string,"memo": string | null,"place_id": string | null,"position": number,"stay_minutes": number | null,"trip_id": string,"updated_at": string,"visit_time": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alias"?: string | null,"created_at"?: string,"day_index": number,"id"?: string,"kind": string,"memo"?: string | null,"place_id"?: string | null,"position": number,"stay_minutes"?: number | null,"trip_id": string,"updated_at"?: string,"visit_time"?: string | null
                  }
                  Update: {
                    "alias"?: string | null,"created_at"?: string,"day_index"?: number,"id"?: string,"kind"?: string,"memo"?: string | null,"place_id"?: string | null,"position"?: number,"stay_minutes"?: number | null,"trip_id"?: string,"updated_at"?: string,"visit_time"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "itinerary_items_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itinerary_items_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"places": {
                  Row: {
                    "address": string | null,"category": string | null,"created_at": string,"id": string,"lat": number | null,"lng": number | null,"name": string | null,"owner_id": string | null,"provider": string,"provider_place_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"category"?: string | null,"created_at"?: string,"id"?: string,"lat"?: number | null,"lng"?: number | null,"name"?: string | null,"owner_id"?: string | null,"provider": string,"provider_place_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"category"?: string | null,"created_at"?: string,"id"?: string,"lat"?: number | null,"lng"?: number | null,"name"?: string | null,"owner_id"?: string | null,"provider"?: string,"provider_place_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"last_trip_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id": string,"last_trip_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"last_trip_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_last_trip_fk"
      columns: ["last_trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_places": {
                  Row: {
                    "alias": string | null,"created_at": string,"id": string,"note": string | null,"place_id": string,"position": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alias"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"place_id": string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "alias"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"place_id"?: string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_places_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    }
                  ]
                },"stays": {
                  Row: {
                    "alias": string | null,"check_in": string,"check_out": string,"created_at": string,"id": string,"place_id": string,"position": number,"trip_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alias"?: string | null,"check_in": string,"check_out": string,"created_at"?: string,"id"?: string,"place_id": string,"position": number,"trip_id": string,"updated_at"?: string
                  }
                  Update: {
                    "alias"?: string | null,"check_in"?: string,"check_out"?: string,"created_at"?: string,"id"?: string,"place_id"?: string,"position"?: number,"trip_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stays_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stays_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "city": string,"country": string | null,"created_at": string,"end_date": string,"id": string,"name": string,"start_date": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string,"country"?: string | null,"created_at"?: string,"end_date": string,"id"?: string,"name": string,"start_date": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "city"?: string,"country"?: string | null,"created_at"?: string,"end_date"?: string,"id"?: string,"name"?: string,"start_date"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "ping":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"save_library":
{ Args: { "p_collections": Json,"p_vault": Json }; Returns: undefined
                           },
"save_trip":
{ Args: { "p": Json }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
