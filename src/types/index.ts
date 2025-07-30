// Re-export types from supabase lib
export type { Project, ProjectVariable, ProjectConfig, ProjectsJsonFormat } from '../lib/supabase'
export { AuthTokenStorageType } from '../lib/supabase'

// Additional UI types
export interface ProjectFormData {
  name: string
  description: string
  is_default: boolean
}

export interface VariableFormData {
  key: string
  value: string
}

// Predefined variable configurations
export const PREDEFINED_VARIABLES = [
  {
    key: 'SWAGGER_URL',
    label: 'Swagger URL',
    description: 'URL to the Swagger/OpenAPI documentation',
    type: 'url',
    placeholder: 'https://api.example.com/docs/swagger.json'
  },
  {
    key: 'LOCALHOST_URL',
    label: 'Localhost URL',
    description: 'Local development server URL',
    type: 'url',
    placeholder: 'http://localhost:5173'
  },
  {
    key: 'AUTH_TOKEN_STORED_IN',
    label: 'Auth Token Storage',
    description: 'Where to store authentication tokens (enum)',
    type: 'select',
    options: ['cookie', 'localStorage', 'sessionStorage'] as const,
    placeholder: 'cookie'
  },
  {
    key: 'AUTH_TOKEN_KEY',
    label: 'Auth Token Key',
    description: 'Key name for storing auth token',
    type: 'text',
    placeholder: 'accessToken'
  },
  {
    key: 'API_BASE_URL',
    label: 'API Base URL',
    description: 'Base URL for API calls',
    type: 'url',
    placeholder: 'https://bandar-app-dev.azurewebsites.net/api'
  },
  {
    key: 'SCREENSHOT_STORAGE_PATH',
    label: 'Screenshot Storage Path',
    description: 'Path where screenshots are stored',
    type: 'text',
    placeholder: '/path/to/screenshots'
  },
  {
    key: 'BROWSER_TOOLS_HOST',
    label: 'Browser Tools Host',
    description: 'Host for browser tools server',
    type: 'text',
    placeholder: '127.0.0.1'
  },
  {
    key: 'BROWSER_TOOLS_PORT',
    label: 'Browser Tools Port',
    description: 'Port for browser tools server',
    type: 'number',
    placeholder: '3025'
  }
] as const