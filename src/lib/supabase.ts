import { createClient } from '@supabase/supabase-js'

// Auth Token Storage Types Enum
export enum AuthTokenStorageType {
  COOKIE = 'cookie',
  LOCAL_STORAGE = 'localStorage',
  SESSION_STORAGE = 'sessionStorage'
}

// For development, we'll use environment variables
// In production, these should be set properly
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Disable auth as requested
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
})

// Database types
export interface Project {
  id: string
  name: string
  description: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ProjectVariable {
  id: string
  project_id: string
  key: string
  value: string | null
  created_at: string
  updated_at: string
}

// Project configuration interface matching MCP server
export interface ProjectConfig {
  SWAGGER_URL?: string
  LOCALHOST_URL?: string
  AUTH_TOKEN_STORED_IN?: AuthTokenStorageType | string // enum type with string fallback
  AUTH_TOKEN_KEY?: string
  API_BASE_URL?: string
  SCREENSHOT_STORAGE_PATH?: string
  BROWSER_TOOLS_HOST?: string
  BROWSER_TOOLS_PORT?: string
}

// Projects.json format for import/export
export interface ProjectsJsonFormat {
  projects: Record<string, {
    name: string
    description: string
    config: ProjectConfig
  }>
  defaultProject: string
}