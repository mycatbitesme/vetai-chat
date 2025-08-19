import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Get supabaseUrl for storage cleanup
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

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
  const [profileFetchFailed, setProfileFetchFailed] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Add debug logging
  console.log('AuthProvider render - loading:', loading, 'user:', !!user, 'userProfile:', !!userProfile)

  // Memoize fetchUserProfile to prevent recreating it on every render
  const fetchUserProfile = useCallback(async (userId, retryCount = 0) => {
    console.log('fetchUserProfile called for userId:', userId, 'retry:', retryCount)
    setProfileFetchFailed(false) // Reset failure state
    try {
      // Longer timeout, and even longer for retries
      const timeoutMs = isInitialLoad ? 15000 : 30000 // 15s initial, 30s for retries
      
      const profilePromise = supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single()
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PROFILE_FETCH_TIMEOUT')), timeoutMs)
      )
      
      const { data, error } = await Promise.race([profilePromise, timeoutPromise])

      if (error) {
        console.error('fetchUserProfile error:', error)
        throw error
      }
      console.log('fetchUserProfile success:', !!data)
      setUserProfile(data)
    } catch (error) {
      if (error.message === 'PROFILE_FETCH_TIMEOUT') {
        console.log('fetchUserProfile timed out, retry count:', retryCount)
        
        // Retry once before giving up, but only during initial load
        if (retryCount === 0 && isInitialLoad) {
          console.log('Retrying profile fetch...')
          return await fetchUserProfile(userId, 1)
        }
        
        // Only mark as failed during initial load
        if (isInitialLoad) {
          console.log('fetchUserProfile timed out after retry - marking as failed')
          setProfileFetchFailed(true)
        } else {
          console.log('fetchUserProfile timed out during normal usage - keeping existing profile')
          // Don't set profileFetchFailed during normal usage
        }
      } else {
        console.error('Error fetching user profile:', error)
        // Only mark as failed during initial load for non-timeout errors too
        if (isInitialLoad) {
          setProfileFetchFailed(true)
        }
      }
      
      // Only clear profile during initial load
      if (isInitialLoad) {
        setUserProfile(null)
      }
    }
  }, [isInitialLoad])

  useEffect(() => {
    console.log('AuthContext useEffect starting')
    
    // Add timeout for initial session loading
    let sessionTimeout = setTimeout(() => {
      console.log('Initial session loading timed out - forcing no session')
      setUser(null)
      setUserProfile(null)
      setLoading(false)
    }, 5000) // 5 second timeout
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(sessionTimeout) // Clear timeout since we got a response
      console.log('Initial session loaded:', !!session?.user)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserProfile(session.user.id).finally(() => {
          console.log('Setting loading to false (initial)')
          setLoading(false)
          setIsInitialLoad(false) // Mark initial load as complete
        })
      } else {
        console.log('Setting loading to false (initial - no user)')
        setLoading(false)
        setIsInitialLoad(false) // Mark initial load as complete
      }
    }).catch(error => {
      clearTimeout(sessionTimeout) // Clear timeout on error
      console.error('Error getting initial session:', error)
      // Clear any corrupted session data
      setUser(null)
      setUserProfile(null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, !!session?.user)
      
      // Clear timeout when auth state changes (successful sign in)
      clearTimeout(sessionTimeout)
      
      setUser(session?.user ?? null)
      
      if (session?.user) {
        // Ensure loading is reset even if fetchUserProfile fails
        try {
          await fetchUserProfile(session.user.id)
        } catch (error) {
          console.error('Error in auth state change profile fetch:', error)
        } finally {
          console.log('Setting loading to false (auth change)')
          setLoading(false)
          setIsInitialLoad(false) // Mark initial load as complete
        }
      } else {
        setUserProfile(null)
        console.log('Setting loading to false (auth change - no user)')
        setLoading(false)
      }
    })

    return () => {
      console.log('AuthContext cleanup - unsubscribing')
      clearTimeout(sessionTimeout) // Clean up timeout on unmount
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
    setLoading(true) // Show loading state during sign out
    
    try {
      // Add a timeout to prevent hanging
      const signOutPromise = supabase.auth.signOut()
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 5000)
      )
      
      const { error } = await Promise.race([signOutPromise, timeoutPromise])
      console.log('signOut completed successfully')
      
      // Force reset state regardless of success
      setTimeout(() => {
        console.log('Resetting auth state after successful signOut')
        setUser(null)
        setUserProfile(null)
        setLoading(false)
      }, 100)
      
      return { error }
    } catch (error) {
      if (error.message === 'TIMEOUT') {
        console.log('signOut timed out - forcing logout')
        // Clear all stored session data to prevent reload issues
        try {
          localStorage.removeItem('supabase.auth.token')
          localStorage.removeItem('sb-' + supabaseUrl.split('//')[1] + '-auth-token')
          sessionStorage.clear()
        } catch (e) {
          console.log('Could not clear storage:', e)
        }
      } else {
        console.error('signOut exception:', error)
      }
      
      // Force reset on any error (including timeout)
      setUser(null)
      setUserProfile(null)
      setLoading(false)
      return { error }
    }
  }

  const value = {
    user,
    userProfile,
    loading,
    profileFetchFailed,
    signIn,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
