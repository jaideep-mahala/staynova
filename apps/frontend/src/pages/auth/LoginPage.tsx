import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { Mail, Lock, Eye, EyeOff, User, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const next = searchParams.get("next") || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
      navigate(next, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center pb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-primary p-3 rounded-xl">
              <span className="text-white text-xl font-bold">SN</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-poppins">Welcome back</CardTitle>
          <CardDescription>Sign in to your StayNova account</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-2" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-xs text-primary hover:text-primary-hover">{showPassword ? "Hide" : "Show"}</button>
              </div>
              <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="accent-primary" /><span className="text-muted-foreground">Remember me</span></label>
              <Link to="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
            </div>
            <Button type="submit" className="w-full py-3" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</Button>
          </form>
        </CardContent>
        <div className="border-t border-border p-6 pt-2">
          <p className="text-center text-sm text-muted-foreground mb-4">Don't have an account?<Link to="/signup" className="text-primary font-medium hover:underline ml-1">Create account</Link></p>
          <hr className="mb-6" />
          <Button variant="outline" className="w-full py-3" onClick={() => {
            setLoading(true);
            setTimeout(() => {
              setLoading(false);
              setAuth({ id: "1", name: "Demo User", email: "demo@example.com", role: "USER" }, "demo-token", "demo-refresh");
              navigate(next, { replace: true });
            }, 1000);
          }} disabled={loading}>
            {loading ? "Connecting..." : "Continue with Google"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
