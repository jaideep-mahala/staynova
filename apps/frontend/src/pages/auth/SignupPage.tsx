import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { Mail, Lock, Phone, User, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupPage() {
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", password: "", role: "USER" as "USER" | "OWNER" });
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
      const { data } = await api.post("/auth/signup", formData);
      setAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
      navigate(next, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center pb-8">
          <div className="flex justify-center mb-4"><div className="bg-primary p-3 rounded-xl"><span className="text-white text-xl font-bold">SN</span></div></div>
          <CardTitle className="text-2xl font-poppins">Create account</CardTitle>
          <CardDescription>Join StayNova to start booking stays</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-6 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" type="text" placeholder="John Doe" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} /></div>
            <div className="space-y-2"><Label htmlFor="email">Email address</Label><Input id="email" type="email" placeholder="name@example.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
            <div className="space-y-2"><Label htmlFor="phone">Phone number (optional)</Label><Input id="phone" type="tel" placeholder="+91 98765 43210" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} /></div>
            <div className="space-y-2"><Label htmlFor="password">Password</Label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary hover:text-primary-hover" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div><p className="text-xs text-muted-foreground">Min 8 characters, 1 uppercase, 1 number</p></div>
            <div className="space-y-2"><Label>I am booking as</Label><div className="grid grid-cols-2 gap-3"><button onClick={() => setFormData({...formData, role: "USER"})} className={`p-3 rounded-xl border ${formData.role === "USER" ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"}`}><User className="h-4 w-4" /><span className="text-sm font-medium">Traveler</span></button><button onClick={() => setFormData({...formData, role: "OWNER"})} className={`p-3 rounded-xl border ${formData.role === "OWNER" ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"}`}><Building2 className="h-4 w-4" /><span className="text-sm font-medium">Property Owner</span></button></div></div>
            <Button type="submit" className="w-full py-3" disabled={loading}>{loading ? "Creating account..." : "Create account"}</Button>
          </form>
        </CardContent>
        <div className="border-t border-border p-6 pt-2 text-center"><p className="text-sm text-muted-foreground mb-4">Already have an account?<Link to="/login" className="text-primary font-medium hover:underline ml-1">Sign in</Link></p></div>
      </Card>
    </div>
  );
}
