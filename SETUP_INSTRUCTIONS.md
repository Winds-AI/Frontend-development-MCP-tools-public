# Environment Variables Manager - Setup Instructions

## Overview
This is a web-based environment variable management system for MCP (Model Context Protocol) projects. It allows you to manage projects and their environment variables through a clean web interface, with full import/export support for projects.json format.

## Prerequisites
- Node.js (v18 or higher)
- pnpm (recommended) or npm
- Supabase account

## Setup Steps

### 1. Install Dependencies
```bash
pnpm install
# or
npm install
```

### 2. Set up Supabase Database

1. Create a new Supabase project at https://supabase.com
2. Go to the SQL Editor in your Supabase dashboard
3. Copy and paste the contents of `database-schema.sql` into the SQL editor
4. Run the SQL to create the tables and policies

### 3. Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

You can find these values in your Supabase project settings under "API".

### 4. Start the Development Server
```bash
pnpm dev
# or
npm run dev
```

The application will be available at http://localhost:5173

## Features

### 🏠 Dashboard
- Overview of all projects
- Quick stats and actions
- Recent projects list

### 📁 Projects Management
- Create, edit, and delete projects
- Set default project
- Project descriptions and metadata

### ⚙️ Environment Variables
- Manage variables per project
- Predefined variables based on MCP ProjectConfig interface
- Custom variables support
- Visual indicators for configured vs missing variables

### 🔄 Import/Export
- Export projects to projects.json format (compatible with MCP tools)
- Import from existing projects.json files
- Preview import changes before applying
- Merge or replace existing data options

## Predefined Variables

The system supports these standard MCP environment variables:

- `SWAGGER_URL` - URL to Swagger/OpenAPI documentation
- `AUTH_ORIGIN` - Origin URL for authentication
- `AUTH_STORAGE_TYPE` - Storage type (localStorage, sessionStorage, cookie)
- `AUTH_TOKEN_KEY` - Key name for auth token storage
- `API_BASE_URL` - Base URL for API calls
- `SCREENSHOT_STORAGE_PATH` - Path for screenshot storage
- `BROWSER_TOOLS_HOST` - Browser tools server host
- `BROWSER_TOOLS_PORT` - Browser tools server port

## Database Schema

The system uses two main tables:

- `projects` - Stores project information and default project flag
- `project_variables` - Stores key-value pairs for each project

## Security Notes

- The system is configured for public access (no authentication required)
- Row Level Security (RLS) is enabled but set to allow all operations
- This is suitable for development/internal use
- For production, consider adding proper authentication

## Troubleshooting

### Common Issues

1. **Database connection errors**
   - Verify your Supabase URL and API key in `.env`
   - Ensure the database schema has been applied

2. **Import/Export not working**
   - Check browser console for JSON parsing errors
   - Verify the JSON format matches the expected structure

3. **Variables not saving**
   - Check network tab for API errors
   - Verify database permissions are set correctly

### Development

To modify the predefined variables, edit `src/types/index.ts` and update the `PREDEFINED_VARIABLES` array.

## Production Deployment

1. Build the application:
```bash
pnpm build
```

2. Deploy the `dist` folder to your hosting provider
3. Ensure environment variables are set in your hosting environment
4. Update Supabase RLS policies if authentication is needed

## Support

For issues related to MCP integration, refer to the main project documentation.
For database or UI issues, check the browser console and network tab for error details.