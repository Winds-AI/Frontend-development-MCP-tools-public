import { supabase, Project, ProjectVariable, ProjectConfig, ProjectsJsonFormat } from '../lib/supabase'

export class DatabaseService {
  // Project operations
  static async getAllProjects(): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  }

  static async getProject(id: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data
  }

  static async createProject(project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
    // If this is set as default, unset all other defaults first
    if (project.is_default) {
      await this.unsetAllDefaults()
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([project])
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  static async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    // If setting as default, unset all other defaults first
    if (updates.is_default) {
      await this.unsetAllDefaults()
    }

    const { data, error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  static async deleteProject(id: string): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }

  static async setDefaultProject(id: string): Promise<void> {
    await this.unsetAllDefaults()
    await this.updateProject(id, { is_default: true })
  }

  private static async unsetAllDefaults(): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .update({ is_default: false })
      .eq('is_default', true)
    
    if (error) throw error
  }

  // Variable operations
  static async getProjectVariables(projectId: string): Promise<ProjectVariable[]> {
    const { data, error } = await supabase
      .from('project_variables')
      .select('*')
      .eq('project_id', projectId)
      .order('key')
    
    if (error) throw error
    return data || []
  }

  static async createVariable(variable: Omit<ProjectVariable, 'id' | 'created_at' | 'updated_at'>): Promise<ProjectVariable> {
    const { data, error } = await supabase
      .from('project_variables')
      .insert([variable])
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  static async updateVariable(id: string, updates: Partial<ProjectVariable>): Promise<ProjectVariable> {
    const { data, error } = await supabase
      .from('project_variables')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  static async deleteVariable(id: string): Promise<void> {
    const { error } = await supabase
      .from('project_variables')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }

  static async upsertVariable(projectId: string, key: string, value: string): Promise<ProjectVariable> {
    const { data, error } = await supabase
      .from('project_variables')
      .upsert([
        {
          project_id: projectId,
          key,
          value,
          updated_at: new Date().toISOString()
        }
      ], {
        onConflict: 'project_id,key'
      })
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  // Import/Export operations
  static async exportToProjectsJson(): Promise<ProjectsJsonFormat> {
    const projects = await this.getAllProjects()
    const result: ProjectsJsonFormat = {
      projects: {},
      defaultProject: ''
    }

    for (const project of projects) {
      const variables = await this.getProjectVariables(project.id)
      const config: ProjectConfig = {}
      
      // Convert variables to config object
      variables.forEach(variable => {
        if (variable.value !== null) {
          (config as any)[variable.key] = variable.value
        }
      })

      result.projects[project.name] = {
        name: project.name,
        description: project.description || '',
        config
      }

      if (project.is_default) {
        result.defaultProject = project.name
      }
    }

    return result
  }

  static async importFromProjectsJson(data: ProjectsJsonFormat, replaceExisting: boolean = false): Promise<void> {
    if (replaceExisting) {
      // Delete all existing projects and variables
      const { error: varsError } = await supabase.from('project_variables').delete().neq('id', '')
      if (varsError) throw varsError
      
      const { error: projError } = await supabase.from('projects').delete().neq('id', '')
      if (projError) throw projError
    }

    // Import projects
    for (const [projectKey, projectData] of Object.entries(data.projects)) {
      const project = await this.createProject({
        name: projectData.name,
        description: projectData.description,
        is_default: projectKey === data.defaultProject
      })

      // Import variables
      for (const [key, value] of Object.entries(projectData.config)) {
        if (value !== undefined) {
          await this.createVariable({
            project_id: project.id,
            key,
            value: String(value)
          })
        }
      }
    }
  }
}