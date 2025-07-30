# Environment Variable Management System - Task Plan

## Project Overview
Build a frontend web application using Vite.js + React + Supabase to manage environment variables for MCP (Model Context Protocol) projects. The system should allow users to manage projects and their associated environment variables through a web interface, with import/export functionality for projects.json format.

## Key Requirements Analysis

### From MCP Server Analysis:
- **ProjectConfig Interface**: 
  - SWAGGER_URL, AUTH_ORIGIN, AUTH_STORAGE_TYPE, AUTH_TOKEN_KEY
  - API_BASE_URL, SCREENSHOT_STORAGE_PATH, BROWSER_TOOLS_HOST, BROWSER_TOOLS_PORT
- **Project Structure**: Each project has name, description, and config
- **Default Project**: One project can be set as default
- **Import/Export**: Must support projects.json format

### Current Frontend State:
- Vite.js React project with TypeScript
- Missing dependencies: react-router-dom, @supabase/supabase-js
- Missing components and lib files
- Auth system already scaffolded but incomplete

## Task Breakdown

### Phase 1: Setup & Dependencies
1. **Install Required Dependencies**
   - react-router-dom + @types/react-router-dom
   - @supabase/supabase-js
   - tailwindcss (for styling)
   - Additional UI libraries if needed

2. **Create Supabase Configuration**
   - Setup supabase client
   - Configure environment variables
   - Disable auth (as requested)

### Phase 2: Database Design & Setup
3. **Design Supabase Schema**
   - `projects` table: id, name, description(optional), is_default, created_at, updated_at
   - `project_variables` table: id, project_id, key, value, description(optional), dependent_tools created_at, updated_at
   - Setup RLS policies (disabled auth = public access)

4. **Create Database Tables & Policies**
   - SQL migrations for tables
   - RLS policies for public access
   - Indexes for performance

### Phase 3: Core Components Development
5. **Create Base Components**
   - Dashboard: Overview of projects and recent activity
   - ProjectList: CRUD operations for projects
   - VariableManager: Manage variables for specific project
   - ImportExport: Import/export projects.json functionality

6. **Create Supporting Components**
   - Project form components
   - Variable form components
   - Confirmation dialogs
   - Loading states

### Phase 4: Business Logic & Services
7. **Database Service Layer**
   - Project CRUD operations
   - Variable CRUD operations
   - Default project management
   - Import/export logic

8. **Validation & Error Handling**
   - Form validation
   - API error handling
   - User feedback systems

### Phase 5: UI/UX & Polish
9. **Styling & Layout**
   - Responsive design
   - Consistent styling
   - Loading states and animations

10. **Testing & Refinement**
    - Manual testing of all features
    - Edge case handling
    - Performance optimization

## Database Schema Design

```sql
-- Projects table
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project variables table
CREATE TABLE project_variables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, key)
);

-- Indexes
CREATE INDEX idx_projects_name ON projects(name);
CREATE INDEX idx_projects_default ON projects(is_default);
CREATE INDEX idx_project_variables_project_id ON project_variables(project_id);
CREATE INDEX idx_project_variables_key ON project_variables(key);
```

## UI Structure Design

### Dashboard Page
- Project count summary
- Default project display
- Recent activity/changes
- Quick actions (add project, import)

### Projects Page
- List all projects with actions
- Add new project form
- Set default project
- Delete projects (with confirmation)
- Navigate to variable management

### Variable Manager Page (per project)
- Display project info
- List all variables for project
- Add/edit/delete variables
- Predefined variable suggestions based on ProjectConfig interface
- Form validation for variable types

### Import/Export Page
- Export current projects to projects.json format
- Import projects.json file
- Preview import changes
- Merge vs replace options

## Key Features

### Project Management
- Create, read, update, delete projects
- Set one project as default
- Project name uniqueness validation

### Variable Management
- Manage variables per project
- Support for all ProjectConfig interface variables
- Custom variables beyond the interface
- Variable validation (URLs, ports, etc.)

### Import/Export
- Export to projects.json format matching MCP server expectations
- Import from projects.json with conflict resolution
- Preview changes before import
- Backup current state before import

### User Experience
- Responsive design
- Loading states
- Error handling with user-friendly messages
- Confirmation dialogs for destructive actions
- Form validation with helpful error messages

## Technical Considerations

### State Management
- React hooks for local state
- Supabase real-time subscriptions for data sync
- Optimistic updates where appropriate

### Performance
- Pagination for large datasets
- Debounced search/filter
- Efficient re-renders

### Security
- Public access (no auth as requested)
- Input sanitization
- SQL injection prevention via Supabase

### Accessibility
- Semantic HTML
- ARIA labels
- Keyboard navigation
- Screen reader support

## Next Steps
1. Get approval for this plan
2. Start with Phase 1: Dependencies and setup
3. Move through phases systematically
4. Test each phase before moving to next