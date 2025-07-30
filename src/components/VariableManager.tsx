import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { DatabaseService } from '../services/database'
import { Project, ProjectVariable, VariableFormData, PREDEFINED_VARIABLES, AuthTokenStorageType } from '../types'

export const VariableManager: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [variables, setVariables] = useState<ProjectVariable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingVariable, setEditingVariable] = useState<ProjectVariable | null>(null)
  const [formData, setFormData] = useState<VariableFormData>({ key: '', value: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (projectId) {
      loadProjectAndVariables()
    }
  }, [projectId])

  const loadProjectAndVariables = async () => {
    if (!projectId) return
    
    try {
      setLoading(true)
      const [projectData, variablesData] = await Promise.all([
        DatabaseService.getProject(projectId),
        DatabaseService.getProjectVariables(projectId)
      ])
      
      setProject(projectData)
      setVariables(variablesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitVariable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !formData.key.trim()) return

    try {
      setSubmitting(true)
      
      if (editingVariable) {
        await DatabaseService.updateVariable(editingVariable.id, {
          key: formData.key.trim(),
          value: formData.value.trim()
        })
      } else {
        await DatabaseService.upsertVariable(projectId, formData.key.trim(), formData.value.trim())
      }
      
      setFormData({ key: '', value: '' })
      setShowAddForm(false)
      setEditingVariable(null)
      await loadProjectAndVariables()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save variable')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditVariable = (variable: ProjectVariable) => {
    setEditingVariable(variable)
    setFormData({ key: variable.key, value: variable.value || '' })
    setShowAddForm(true)
  }

  const handleDeleteVariable = async (variableId: string, variableKey: string) => {
    if (!confirm(`Are you sure you want to delete the variable "${variableKey}"?`)) {
      return
    }

    try {
      await DatabaseService.deleteVariable(variableId)
      await loadProjectAndVariables()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete variable')
    }
  }

  const handlePredefinedVariable = (key: string) => {
    const existing = variables.find(v => v.key === key)
    if (existing) {
      handleEditVariable(existing)
    } else {
      setFormData({ key, value: '' })
      setShowAddForm(true)
      setEditingVariable(null)
    }
  }

  const cancelForm = () => {
    setShowAddForm(false)
    setEditingVariable(null)
    setFormData({ key: '', value: '' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Project not found</h2>
        <p className="mt-2 text-gray-600">The requested project could not be found.</p>
        <Link to="/projects" className="mt-4 inline-block text-blue-600 hover:text-blue-500">
          ← Back to Projects
        </Link>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <nav className="flex" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-4">
            <li>
              <Link to="/projects" className="text-gray-400 hover:text-gray-500">
                Projects
              </Link>
            </li>
            <li>
              <div className="flex items-center">
                <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                <span className="ml-4 text-sm font-medium text-gray-500">
                  {project.name}
                </span>
              </div>
            </li>
          </ol>
        </nav>
        
        <div className="mt-4 sm:flex sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <span className="mr-2">{project.is_default ? '⭐' : '📁'}</span>
              {project.name}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {project.description || 'No description'}
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <span className="mr-2">➕</span>
              Add Variable
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Predefined Variables Section */}
      <div className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Predefined Variables</h2>
        <p className="text-sm text-gray-600 mb-4">
          These are the standard environment variables used by MCP tools. Click to add or edit them.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PREDEFINED_VARIABLES.map((predefined) => {
            const existing = variables.find(v => v.key === predefined.key)
            return (
              <div
                key={predefined.key}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  existing 
                    ? 'border-green-200 bg-green-50 hover:bg-green-100' 
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
                onClick={() => handlePredefinedVariable(predefined.key)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-900">
                    {predefined.label}
                  </h3>
                  <span className="text-xs">
                    {existing ? '✅' : '➕'}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  {predefined.description}
                </p>
                {existing && (
                  <div className="text-xs text-gray-800 font-mono bg-white px-2 py-1 rounded border">
                    {existing.value || '(empty)'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add/Edit Variable Form */}
      {showAddForm && (
        <div className="mb-8 bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              {editingVariable ? 'Edit Variable' : 'Add New Variable'}
            </h3>
            <form onSubmit={handleSubmitVariable} className="mt-5">
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label htmlFor="key" className="block text-sm font-medium text-gray-700">
                    Variable Key *
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="key"
                      id="key"
                      required
                      value={formData.key}
                      onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md font-mono"
                      placeholder="VARIABLE_NAME"
                    />
                  </div>
                </div>

                <div className="sm:col-span-6">
                  <label htmlFor="value" className="block text-sm font-medium text-gray-700">
                    Variable Value
                  </label>
                  <div className="mt-1">
                    {(() => {
                      const predefinedVar = PREDEFINED_VARIABLES.find(v => v.key === formData.key)
                      
                      if (predefinedVar?.type === 'select' && predefinedVar.options) {
                        return (
                          <select
                            id="value"
                            name="value"
                            value={formData.value}
                            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                            className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                          >
                            <option value="">Select an option...</option>
                            {predefinedVar.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        )
                      }
                      
                      return (
                        <textarea
                          id="value"
                          name="value"
                          rows={3}
                          value={formData.value}
                          onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md font-mono"
                          placeholder={predefinedVar?.placeholder || "Variable value..."}
                        />
                      )
                    })()}
                  </div>
                  {(() => {
                    const predefinedVar = PREDEFINED_VARIABLES.find(v => v.key === formData.key)
                    if (predefinedVar?.key === 'AUTH_TOKEN_STORED_IN') {
                      return (
                        <p className="mt-2 text-sm text-gray-500">
                          <strong>Enum values:</strong> cookie | localStorage | sessionStorage
                        </p>
                      )
                    }
                    return null
                  })()}
                </div>
              </div>

              <div className="mt-5 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={cancelForm}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.key.trim()}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : (editingVariable ? 'Update Variable' : 'Add Variable')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}    
  {/* Variables List */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">All Variables</h2>
        {variables.length === 0 ? (
          <div className="text-center py-12 bg-white shadow sm:rounded-lg">
            <span className="text-4xl">📝</span>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No variables</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by adding your first environment variable.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <span className="mr-2">➕</span>
                Add Variable
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {variables.map((variable) => (
                <li key={variable.id}>
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <p className="text-sm font-medium text-gray-900 font-mono">
                            {variable.key}
                          </p>
                          {PREDEFINED_VARIABLES.find(p => p.key === variable.key) && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Predefined
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          <div className="text-sm text-gray-600 font-mono bg-gray-50 px-3 py-2 rounded border max-w-2xl overflow-x-auto">
                            {variable.value || '(empty)'}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          Updated: {new Date(variable.updated_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditVariable(variable)}
                          className="text-blue-600 hover:text-blue-900 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteVariable(variable.id, variable.key)}
                          className="text-red-600 hover:text-red-900 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}