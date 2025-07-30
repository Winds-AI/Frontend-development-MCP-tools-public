import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Navigation } from './components/Navigation'
import { Dashboard } from './components/Dashboard'
import { ProjectList } from './components/ProjectList'
import { VariableManager } from './components/VariableManager'
import { ImportExport } from './components/ImportExport'

const App: React.FC = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/projects/:projectId/variables" element={<VariableManager />} />
            <Route path="/import-export" element={<ImportExport />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App