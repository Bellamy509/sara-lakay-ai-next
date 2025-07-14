"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  User,
  Mail,
  Lock,
  ArrowRight,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import { toast } from "sonner";

export default function SignUpPage() {
  const { signUp } = useSupabaseAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);

  const getPasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    return {
      score: strength,
      label: strength < 2 ? "Weak" : strength < 4 ? "Fair" : "Strong",
      color:
        strength < 2
          ? "text-red-400"
          : strength < 4
            ? "text-yellow-400"
            : "text-green-400",
      barColor:
        strength < 2
          ? "bg-red-500"
          : strength < 4
            ? "bg-yellow-500"
            : "bg-green-500",
    };
  };

  const passwordStrength = getPasswordStrength(form.password);
  const passwordsMatch = form.password === form.confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    try {
      const result = await signUp(form.name, form.email, form.password);
      if (result) {
        // Account created and automatically signed in
        toast.success("Account created successfully!", {
          description: `Welcome to David, ${result.name}!`,
          duration: 2000,
        });

        // Force immediate redirection to home page
        console.log("🔄 Account created successfully, redirecting to home...");

        // Use timeout to ensure toast shows, then redirect
        setTimeout(() => {
          window.location.href = "/";
        }, 1000);

        return; // Exit early to prevent further processing
      } else {
        // This shouldn't happen, but just in case
        setError("Failed to create account");
      }
    } catch (err: any) {
      const errorMessage = err.message || "Registration failed";
      setError(errorMessage);

      // Check if it's an email confirmation message
      if (
        errorMessage.includes("check your email") ||
        errorMessage.includes("confirm your account")
      ) {
        setAccountCreated(true);
        toast.success("Account created!", {
          description: "Please check your email to confirm your account",
          duration: 6000,
        });
      } else {
        toast.error("Registration failed", {
          description: errorMessage,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // If account was created but needs confirmation, show special UI
  if (accountCreated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-stone-800 to-slate-900 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

        <div className="relative z-10 w-full max-w-md">
          <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Check Your Email
            </h1>
            <p className="text-zinc-400 mb-6">
              We&apos;ve sent a confirmation link to{" "}
              <span className="text-blue-400 font-medium">{form.email}</span>
            </p>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-400">
                Please click the confirmation link in your email to activate
                your account, then return here to sign in.
              </p>
            </div>

            <div className="space-y-3">
              <Link href="/sign-in">
                <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 rounded-xl transition-all duration-200 transform hover:scale-[1.02]">
                  Go to Sign In
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>

              <p className="text-sm text-zinc-500">
                Didn&apos;t receive the email? Check your spam folder or{" "}
                <button
                  onClick={() => setAccountCreated(false)}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  try again
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-stone-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Create Account
            </h1>
            <p className="text-zinc-400">Join David today</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="name"
                className="text-sm font-medium text-zinc-300"
              >
                Full name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                <Input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-purple-500/50 focus:ring-purple-500/20"
                  placeholder="Enter your full name"
                  required
                />
              </div>
            </div>

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
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-purple-500/50 focus:ring-purple-500/20"
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
                  className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-purple-500/50 focus:ring-purple-500/20"
                  placeholder="Create a strong password"
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

              {form.password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-400">Password strength</span>
                    <span className={passwordStrength.color}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${passwordStrength.barColor}`}
                      style={{
                        width: `${(passwordStrength.score / 5) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-zinc-300"
              >
                Confirm password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm({ ...form, confirmPassword: e.target.value })
                  }
                  className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-purple-500/50 focus:ring-purple-500/20"
                  placeholder="Confirm your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-300"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>

              {form.confirmPassword && (
                <div className="flex items-center text-xs mt-1">
                  {passwordsMatch ? (
                    <>
                      <Check className="w-3 h-3 text-green-400 mr-1" />
                      <span className="text-green-400">Passwords match</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3 h-3 text-red-400 mr-1" />
                      <span className="text-red-400">
                        Passwords don&apos;t match
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start">
                <AlertCircle className="w-5 h-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !passwordsMatch}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Creating account...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  Create Account
                  <ArrowRight className="ml-2 h-5 w-5" />
                </div>
              )}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-zinc-400 text-sm">
              Already have an account?{" "}
              <Link
                href="/sign-in"
                className="text-purple-400 hover:text-purple-300 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
