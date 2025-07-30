-- Environment Variables Manager Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project variables table
CREATE TABLE IF NOT EXISTS project_variables (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_default ON projects(is_default);
CREATE INDEX IF NOT EXISTS idx_project_variables_project_id ON project_variables(project_id);
CREATE INDEX IF NOT EXISTS idx_project_variables_key ON project_variables(key);

-- RLS Policies (Public access as requested - no auth)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_variables ENABLE ROW LEVEL SECURITY;

-- Allow all operations for everyone (no auth)
CREATE POLICY "Allow all operations on projects" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all operations on project_variables" ON project_variables FOR ALL USING (true);

-- Function to ensure only one default project
CREATE OR REPLACE FUNCTION ensure_single_default_project()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE projects SET is_default = FALSE WHERE id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain single default project
DROP TRIGGER IF EXISTS trigger_ensure_single_default_project ON projects;
CREATE TRIGGER trigger_ensure_single_default_project
  AFTER INSERT OR UPDATE ON projects
  FOR EACH ROW
  WHEN (NEW.is_default = TRUE)
  EXECUTE FUNCTION ensure_single_default_project();