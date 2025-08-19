import React from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import Chat from './components/Chat'
import { Loader2 } from 'lucide-react'

function AppContent() {
  const { user, userProfile, loading, profileFetchFailed, signOut } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // If we have a user but profile fetch failed, force logout
  if (user && profileFetchFailed) {
    console.log('Profile fetch failed for logged in user - forcing logout')
    signOut()
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-600">Signing out...</p>
        </div>
      </div>
    )
  }

  if (!user || !userProfile) {
    return <Login />
  }

  return <Chat />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
