import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext()

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Add debug logging
  console.log('AuthProvider render - loading:', loading, 'user:', !!user, 'userProfile:', !!userProfile)

  // Memoize fetchUserProfile to prevent recreating it on every render
  const fetchUserProfile = useCallback(async (userId) => {
    console.log('fetchUserProfile called for userId:', userId)
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error) {
        console.error('fetchUserProfile error:', error)
        throw error
      }
      console.log('fetchUserProfile success:', !!data)
      setUserProfile(data)
    } catch (error) {
      console.error('Error fetching user profile:', error)
    }
  }, [])

  useEffect(() => {
    console.log('AuthContext useEffect starting')
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session loaded:', !!session?.user)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserProfile(session.user.id)
      }
      console.log('Setting loading to false (initial)')
      setLoading(false)
    }).catch(error => {
      console.error('Error getting initial session:', error)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, !!session?.user)
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchUserProfile(session.user.id)
      } else {
        setUserProfile(null)
      }
      console.log('Setting loading to false (auth change)')
      setLoading(false)
    })

    return () => {
      console.log('AuthContext cleanup - unsubscribing')
      subscription.unsubscribe()
    }
  }, [fetchUserProfile])

  const signIn = async (email, password) => {
    console.log('signIn called')
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signOut = async () => {
    console.log('signOut called')
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const value = {
    user,
    userProfile,
    loading,
    signIn,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
