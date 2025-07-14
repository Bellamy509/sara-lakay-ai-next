"use client";

import { useState } from "react";
import { Eye, EyeOff, Mail, Lock, ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import { toast } from "sonner";

export default function SignInPage() {
  const { signIn, resendConfirmation } = useSupabaseAuth();
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNeedsConfirmation(false);

    try {
      const result = await signIn(form.email, form.password);
      if (result) {
        toast.success("Successfully signed in!", {
          description: `Welcome back ${result.name}`,
          duration: 2000,
        });

        // Force immediate redirection to home page
        console.log("🔄 Sign-in successful, redirecting to home...");

        // Use timeout to ensure toast shows, then redirect
        setTimeout(() => {
          window.location.href = "/";
        }, 1000);

        return; // Exit early to prevent further processing
      } else {
        setError("Invalid email or password");
      }
    } catch (err: any) {
      const errorMessage = err.message || "Sign in failed";
      setError(errorMessage);

      // Check if it's an email confirmation error
      if (
        errorMessage.includes("confirm your email") ||
        errorMessage.includes("Email not confirmed")
      ) {
        setNeedsConfirmation(true);
        toast.error("Email confirmation required", {
          description: "Please check your email and confirm your account",
        });
      } else {
        toast.error("Sign in failed", {
          description: errorMessage,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!form.email) {
      toast.error("Please enter your email address first");
      return;
    }

    setResendLoading(true);
    try {
      await resendConfirmation(form.email);
      toast.success("Confirmation email sent!", {
        description: "Please check your inbox and spam folder",
        duration: 5000,
      });
    } catch (err: any) {
      toast.error("Failed to resend confirmation", {
        description: err.message,
      });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-stone-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Sign In</h1>
            <p className="text-zinc-400">Secure Authentication</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-zinc-300"
              >
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-blue-500/50 focus:ring-blue-500/20"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-zinc-300"
              >
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-blue-500/50 focus:ring-blue-500/20"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-300"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {needsConfirmation && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-blue-400 mb-3">
                  Your email address needs to be confirmed before you can sign
                  in.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResendConfirmation}
                  disabled={resendLoading}
                  className="bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20"
                >
                  {resendLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Resend confirmation email
                    </>
                  )}
                </Button>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 rounded-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Signing in...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  Sign In
                  <ArrowRight className="ml-2 h-5 w-5" />
                </div>
              )}
            </Button>

            <div className="text-center">
              <button
                type="button"
                className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
                onClick={() => {
                  toast.info("Password reset", {
                    description:
                      "Contact your administrator for password reset",
                    duration: 4000,
                  });
                }}
              >
                Forgot your password?
              </button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-zinc-400 text-sm">
              Don&apos;t have an account?{" "}
              <Link
                href="/sign-up"
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
