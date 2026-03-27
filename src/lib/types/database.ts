export type PlantStatus = 'active' | 'inactive' | 'archived'
export type AppRole = 'admin' | 'super_admin'
export type PlantQrStatus = 'pending' | 'ready' | 'failed'
export type ImportBatchStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          display_name?: string | null
          avatar_url?: string | null
        }
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: AppRole
          created_at: string
        }
        Insert: {
          user_id: string
          role: AppRole
        }
        Update: {
          role?: AppRole
        }
      }
      plants: {
        Row: {
          id: string
          slug: string
          common_name: string
          scientific_name: string | null
          status: PlantStatus
          summary: string | null
          light_level: string | null
          water_level: string | null
          internal_notes: string | null
          qr_target_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          slug: string
          common_name: string
          scientific_name?: string | null
          status?: PlantStatus
          summary?: string | null
          light_level?: string | null
          water_level?: string | null
          internal_notes?: string | null
          qr_target_url?: string | null
        }
        Update: {
          slug?: string
          common_name?: string
          scientific_name?: string | null
          status?: PlantStatus
          summary?: string | null
          light_level?: string | null
          water_level?: string | null
          internal_notes?: string | null
          qr_target_url?: string | null
        }
      }
      plant_catalog_photos: {
        Row: {
          id: string
          plant_id: string
          storage_path: string
          alt_text: string | null
          sort_order: number
          is_cover: boolean
          created_at: string
        }
        Insert: {
          plant_id: string
          storage_path: string
          alt_text?: string | null
          sort_order?: number
          is_cover?: boolean
        }
        Update: {
          alt_text?: string | null
          sort_order?: number
          is_cover?: boolean
        }
      }
      plant_qr_codes: {
        Row: {
          id: string
          plant_id: string
          qr_token: string
          qr_value: string
          qr_image_path: string | null
          is_primary: boolean
          is_active: boolean
          status: PlantQrStatus
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          plant_id: string
          qr_token: string
          qr_value: string
          qr_image_path?: string | null
          is_primary?: boolean
          is_active?: boolean
          status?: PlantQrStatus
          last_error?: string | null
        }
        Update: {
          qr_image_path?: string | null
          is_primary?: boolean
          is_active?: boolean
          status?: PlantQrStatus
          last_error?: string | null
        }
      }
      plant_tags: {
        Row: {
          id: string
          name: string
          slug: string
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          slug: string
          is_active?: boolean
          sort_order?: number
        }
        Update: {
          name?: string
          slug?: string
          is_active?: boolean
          sort_order?: number
        }
      }
      plant_tag_assignments: {
        Row: {
          id: string
          plant_id: string
          tag_id: string
          created_at: string
        }
        Insert: {
          plant_id: string
          tag_id: string
        }
        Update: Record<string, never>
      }
      plant_content_sections: {
        Row: {
          id: string
          plant_id: string
          section_key: string
          section_label: string
          content: string
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          plant_id: string
          section_key: string
          section_label: string
          content?: string
          sort_order?: number
          is_active?: boolean
        }
        Update: {
          section_key?: string
          section_label?: string
          content?: string
          sort_order?: number
          is_active?: boolean
        }
      }
      import_batches: {
        Row: {
          id: string
          created_by: string | null
          source_name: string | null
          status: ImportBatchStatus
          total_rows: number | null
          processed_rows: number | null
          error_summary: unknown | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          created_by?: string | null
          source_name?: string | null
          status?: ImportBatchStatus
          total_rows?: number | null
          processed_rows?: number | null
          error_summary?: unknown | null
          completed_at?: string | null
        }
        Update: {
          status?: ImportBatchStatus
          total_rows?: number | null
          processed_rows?: number | null
          error_summary?: unknown | null
          completed_at?: string | null
        }
      }
    }
  }
}
