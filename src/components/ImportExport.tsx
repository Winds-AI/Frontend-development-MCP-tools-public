import React, { useState } from 'react'
import { DatabaseService } from '../services/database'
import { ProjectsJsonFormat } from '../types'

export const ImportExport: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [importData, setImportData] = useState<string>('')
  const [previewData, setPreviewData] = useState<ProjectsJsonFormat | null>(null)
  const [replaceExisting, setReplaceExisting] = useState(false)

  const handleExport = async () => {
    try {
      setLoading(true)
      setError(null)
      setSuccess(null)
      
      const data = await DatabaseService.exportToProjectsJson()
      
      // Create and download file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `projects-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setSuccess('Projects exported successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export projects')
    } finally {
      setLoading(false)
    }
  }

  const handlePreviewImport = () => {
    try {
      setError(null)
      setSuccess(null)
      
      if (!importData.trim()) {
        setError('Please paste JSON data to preview')
        return
      }
      
      const parsed = JSON.parse(importData) as ProjectsJsonFormat
      
      // Basic validation
      if (!parsed.projects || typeof parsed.projects !== 'object') {
        throw new Error('Invalid format: missing or invalid "projects" field')
      }
      
      if (!parsed.defaultProject || typeof parsed.defaultProject !== 'string') {
        throw new Error('Invalid format: missing or invalid "defaultProject" field')
      }
      
      setPreviewData(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON format')
      setPreviewData(null)
    }
  }

  const handleImport = async () => {
    if (!previewData) {
      setError('Please preview the import data first')
      return
    }

    try {
      setLoading(true)
      setError(null)
      setSuccess(null)
      
      await DatabaseService.importFromProjectsJson(previewData, replaceExisting)
      
      setSuccess(`Projects imported successfully! ${replaceExisting ? 'Existing data was replaced.' : 'Data was merged with existing projects.'}`)
      setImportData('')
      setPreviewData(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import projects')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Import/Export</h1>
          <p className="mt-2 text-sm text-gray-700">
            Export your projects to projects.json format or import from existing configurations.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
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

      {success && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Success</h3>
              <div className="mt-2 text-sm text-green-700">{success}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Export Section */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
              <span className="mr-2">📤</span>
              Export Projects
            </h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>
                Export all your projects and their environment variables to a projects.json file 
                that can be used with MCP tools.
              </p>
            </div>
            <div className="mt-5">
              <button
                type="button"
                onClick={handleExport}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Exporting...
                  </>
                ) : (
                  <>
                    <span className="mr-2">📤</span>
                    Export to JSON
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Import Section */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
              <span className="mr-2">📥</span>
              Import Projects
            </h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>
                Import projects from a projects.json file. You can choose to merge with existing 
                data or replace it entirely.
              </p>
            </div>
            <div className="mt-5">
              <label htmlFor="import-data" className="block text-sm font-medium text-gray-700">
                Paste JSON Data
              </label>
              <div className="mt-1">
                <textarea
                  id="import-data"
                  name="import-data"
                  rows={8}
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md font-mono"
                  placeholder='{"projects": {...}, "defaultProject": "..."}'
                />
              </div>
              
              <div className="mt-4 flex items-center">
                <input
                  id="replace-existing"
                  name="replace-existing"
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="replace-existing" className="ml-2 block text-sm text-gray-900">
                  Replace existing data (⚠️ This will delete all current projects)
                </label>
              </div>

              <div className="mt-4 flex space-x-3">
                <button
                  type="button"
                  onClick={handlePreviewImport}
                  disabled={!importData.trim()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <span className="mr-2">👁️</span>
                  Preview
                </button>
                
                {previewData && (
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Importing...
                      </>
                    ) : (
                      <>
                        <span className="mr-2">📥</span>
                        Import
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div> 
     {/* Preview Section */}
      {previewData && (
        <div className="mt-8 bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
              <span className="mr-2">👁️</span>
              Import Preview
            </h3>
            <div className="mt-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  Projects to import: {Object.keys(previewData.projects).length}
                </h4>
                <div className="space-y-3">
                  {Object.entries(previewData.projects).map(([key, project]) => (
                    <div key={key} className="bg-white rounded border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-sm font-medium text-gray-900">
                          {project.name}
                          {key === previewData.defaultProject && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Default
                            </span>
                          )}
                        </h5>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">
                        {project.description}
                      </p>
                      <div className="text-xs text-gray-500">
                        Variables: {Object.keys(project.config).length}
                        {Object.keys(project.config).length > 0 && (
                          <span className="ml-2">
                            ({Object.keys(project.config).join(', ')})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Format Example */}
      <div className="mt-8 bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
            <span className="mr-2">📋</span>
            Expected JSON Format
          </h3>
          <div className="mt-4">
            <pre className="text-xs bg-gray-50 rounded-lg p-4 overflow-x-auto">
{`{
  "projects": {
    "my-project": {
      "name": "my-project",
      "description": "My awesome project",
      "config": {
        "API_BASE_URL": "https://api.example.com",
        "AUTH_TOKEN_KEY": "authToken",
        "SWAGGER_URL": "https://api.example.com/docs"
      }
    }
  },
  "defaultProject": "my-project"
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}