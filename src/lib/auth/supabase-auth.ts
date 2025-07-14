// Supabase Authentication System - Auth Only (No Custom Tables)
import React from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Types
export interface SupabaseUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  created_at: string;
  login_time?: string;
}

export interface SupabaseSession {
  id: string;
  email: string;
  name: string;
  avatar: string;
  login_time: string;
  access_token?: string;
}

// Supabase configuration
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://fsgossoeshkajzhblufs.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZ29zc29lc2hrYWp6aGJsdWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzNjQ4NDEsImV4cCI6MjA2Mzk0MDg0MX0.lener_f3RySOuUFUtgnbjTkbDlikjB-scIoK_hTI_N4";

// Create Supabase client
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// Supabase Auth Only System
class SupabaseAuth {
  private static instance: SupabaseAuth;

  static getInstance(): SupabaseAuth {
    if (!SupabaseAuth.instance) {
      SupabaseAuth.instance = new SupabaseAuth();
    }
    return SupabaseAuth.instance;
  }

  // Sign up with email/password using only Supabase Auth
  async signUp(
    name: string,
    email: string,
    password: string,
  ): Promise<SupabaseSession | null> {
    try {
      console.log("🚀 Starting Supabase Auth signup:", { name, email });

      // Create user in Supabase Auth with metadata (no email confirmation required)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
            login_time: new Date().toISOString(),
          },
          emailRedirectTo: undefined, // Disable email confirmation for now
        },
      });

      if (authError) {
        console.error("❌ Supabase Auth signup error:", authError);
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error("Failed to create user");
      }

      console.log("✅ Supabase Auth user created:", authData.user);

      // If user needs email confirmation, handle it gracefully
      if (!authData.session && !authData.user.email_confirmed_at) {
        console.log("📧 Email confirmation required");
        throw new Error(
          "Please check your email to confirm your account before signing in",
        );
      }

      // Create session from auth data (if session exists)
      if (authData.session) {
        const session: SupabaseSession = {
          id: authData.user.id,
          email,
          name,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
          login_time: new Date().toISOString(),
          access_token: authData.session?.access_token,
        };

        // Save session to localStorage for immediate access
        this.saveSessionToStorage(session);

        console.log("✅ Supabase signup successful:", session);
        return session;
      } else {
        // Account created but needs confirmation
        console.log("📧 Account created, email confirmation required");
        throw new Error(
          "Account created successfully! Please check your email to confirm your account before signing in.",
        );
      }
    } catch (error: any) {
      console.error("❌ Signup error:", error);
      throw new Error(error.message || "Registration failed");
    }
  }

  // Sign in with email/password using Supabase Auth
  async signIn(
    email: string,
    password: string,
  ): Promise<SupabaseSession | null> {
    try {
      console.log("🔐 Starting Supabase signin:", email);

      // Authenticate with Supabase
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) {
        console.error("❌ Supabase Auth signin error:", authError);

        // Handle specific error cases
        if (authError.message.includes("Email not confirmed")) {
          throw new Error(
            "Please confirm your email address before signing in. Check your inbox for a confirmation link.",
          );
        }
        if (authError.message.includes("Invalid login credentials")) {
          throw new Error(
            "Invalid email or password. Please check your credentials.",
          );
        }

        throw new Error(authError.message);
      }

      if (!authData.user || !authData.session) {
        throw new Error("Invalid credentials");
      }

      // Extract user data from auth metadata
      const userData = authData.user.user_metadata;
      const name =
        userData?.name || authData.user.email?.split("@")[0] || "User";
      const avatar =
        userData?.avatar ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;

      // Create session
      const session: SupabaseSession = {
        id: authData.user.id,
        email,
        name,
        avatar,
        login_time: new Date().toISOString(),
        access_token: authData.session.access_token,
      };

      // Save session to localStorage
      this.saveSessionToStorage(session);

      console.log("✅ Supabase signin successful:", session);
      return session;
    } catch (error: any) {
      console.error("❌ Signin error:", error);
      throw new Error(error.message || "Login failed");
    }
  }

  // Get current session
  async getCurrentSession(): Promise<SupabaseSession | null> {
    try {
      // Check Supabase session first
      const { data: authData, error } = await supabase.auth.getSession();

      if (error || !authData.session) {
        // Clear localStorage if no valid session
        this.clearSessionFromStorage();
        return null;
      }

      // Extract user data from auth
      const user = authData.session.user;
      const userData = user.user_metadata;
      const name = userData?.name || user.email?.split("@")[0] || "User";
      const avatar =
        userData?.avatar ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`;

      // Create session object
      const session: SupabaseSession = {
        id: user.id,
        email: user.email || "",
        name,
        avatar,
        login_time: userData?.login_time || new Date().toISOString(),
        access_token: authData.session.access_token,
      };

      // Update localStorage
      this.saveSessionToStorage(session);

      return session;
    } catch (error: any) {
      console.error("❌ Get session error:", error);
      return null;
    }
  }

  // Resend confirmation email
  async resendConfirmation(email: string): Promise<void> {
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log("✅ Confirmation email resent");
    } catch (error: any) {
      console.error("❌ Resend confirmation error:", error);
      throw new Error(error.message || "Failed to resend confirmation email");
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
      this.clearSessionFromStorage();
      console.log("👋 Supabase signout successful");
    } catch (error: any) {
      console.error("❌ Signout error:", error);
      // Clear localStorage anyway
      this.clearSessionFromStorage();
    }
  }

  // Check if authenticated (quick localStorage check)
  isAuthenticated(): boolean {
    try {
      const session = localStorage.getItem("sara_user_session");
      const token = localStorage.getItem("sara_auth_token");
      return !!(session && token);
    } catch {
      return false;
    }
  }

  // Get session from localStorage (quick access)
  getSessionFromStorage(): SupabaseSession | null {
    try {
      const sessionData = localStorage.getItem("sara_user_session");
      return sessionData ? JSON.parse(sessionData) : null;
    } catch {
      return null;
    }
  }

  // Private helpers
  private saveSessionToStorage(session: SupabaseSession): void {
    try {
      const token = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("sara_user_session", JSON.stringify(session));
      localStorage.setItem("sara_auth_token", token);
    } catch (error) {
      console.error("❌ Save session to storage error:", error);
    }
  }

  private clearSessionFromStorage(): void {
    try {
      localStorage.removeItem("sara_user_session");
      localStorage.removeItem("sara_auth_token");
    } catch (error) {
      console.error("❌ Clear session from storage error:", error);
    }
  }
}

// Export singleton instance
export const supabaseAuth = SupabaseAuth.getInstance();

// React Hook for Supabase Authentication
export function useSupabaseAuth() {
  const [user, setUser] = React.useState<SupabaseSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Hydration effect
  React.useEffect(() => {
    setIsHydrated(true);
    checkSession();
  }, []);

  const checkSession = React.useCallback(async () => {
    if (typeof window === "undefined") return;

    try {
      setLoading(true);

      // Quick check from localStorage first
      const quickSession = supabaseAuth.getSessionFromStorage();
      if (quickSession) {
        setUser(quickSession);
        setIsAuthenticated(true);
      }

      // Then verify with Supabase
      const session = await supabaseAuth.getCurrentSession();

      if (session) {
        setUser(session);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("❌ Check session error:", error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const session = await supabaseAuth.signIn(email, password);
    if (session) {
      setUser(session);
      setIsAuthenticated(true);
      // Force immediate state update and re-verification
      setLoading(false);
      console.log("✅ SignIn state updated immediately:", {
        session,
        isAuthenticated: true,
      });
    }
    return session;
  }, []);

  const signUp = React.useCallback(
    async (name: string, email: string, password: string) => {
      const session = await supabaseAuth.signUp(name, email, password);
      if (session) {
        setUser(session);
        setIsAuthenticated(true);
        // Force immediate state update
        setLoading(false);
        console.log("✅ SignUp state updated immediately:", {
          session,
          isAuthenticated: true,
        });
      }
      return session;
    },
    [],
  );

  const signOut = React.useCallback(async () => {
    try {
      await supabaseAuth.signOut();
      // Immediately clear states and force re-verification
      setUser(null);
      setIsAuthenticated(false);
      setLoading(false);
      // Clear any potential cached session
      localStorage.removeItem("sara_user_session");
      localStorage.removeItem("sara_auth_token");
      console.log("✅ Sign out successful, states cleared immediately");
    } catch (error) {
      console.error("❌ Sign out error:", error);
      // Force clear states even on error
      setUser(null);
      setIsAuthenticated(false);
      setLoading(false);
      localStorage.removeItem("sara_user_session");
      localStorage.removeItem("sara_auth_token");
    }
  }, []);

  const resendConfirmation = React.useCallback(async (email: string) => {
    await supabaseAuth.resendConfirmation(email);
  }, []);

  return {
    user,
    isAuthenticated,
    loading,
    isHydrated,
    signIn,
    signUp,
    signOut,
    resendConfirmation,
    checkSession,
  };
}

// Export Supabase client for direct access if needed
export { supabase };
