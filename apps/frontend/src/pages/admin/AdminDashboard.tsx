import { Link } from "react-router-dom";
import { LayoutDashboard, Users, Building2, ShieldCheck, CreditCard, TrendingUp, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STATS = [
  { label: "Platform GMV", value: "₹45,00,000", change: "+15%", icon: CreditCard },
  { label: "Total Properties", value: "124", change: "+23", icon: Building2 },
  { label: "Pending Approvals", value: "8", change: "3 new", icon: ShieldCheck },
  { label: "Total Users", value: "3,420", change: "+12%", icon: Users },
];

export function AdminDashboard() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">
          ← Back to StayNova
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pl-4 border-l border-border">
            <div className="w-8 h-8 rounded-full bg-error flex items-center justify-center text-white font-semibold text-sm">
              A
            </div>
            <span className="text-sm font-medium text-foreground hidden sm:block">Admin Dashboard</span>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {STATS.map((stat) => (
            <Card key={stat.label} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <h3 className="text-2xl font-bold">{stat.value}</h3>
                  <p className="text-xs text-green-600 font-medium">{stat.change} vs last month</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Pending Approvals */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-poppins text-lg font-bold">Pending Property Approvals</h2>
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="hover:shadow-card transition">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold">Property {i}</h3>
                          <p className="text-sm text-muted-foreground">Jaipur, Rajasthan · Submitted 2 days ago</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => {}}>Reject</Button>
                        <Button size="sm" className="bg-primary text-white">Approve</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Analytics */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Platform Analytics</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-64 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">Coming Soon</div>
                    <p className="text-xs text-muted-foreground mt-2">Analytics dashboard</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
