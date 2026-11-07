import { useState } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, Building2, Calendar, CreditCard, Users, ShieldCheck, Bell, ArrowRight, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATS = [
  { label: "Total Revenue", value: "₹2,45,000", change: "+12%", icon: CreditCard, color: "text-primary" },
  { label: "Total Bookings", value: "142", change: "+8%", icon: Calendar, color: "text-accent" },
  { label: "Occupancy Rate", value: "78%", change: "+5%", icon: Building2, color: "text-success" },
  { label: "Avg. Daily Rate", value: "₹6,500", change: "+3%", icon: CreditCard, color: "text-primary" },
];

export function OwnerDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">
          ← Back to StayNova
        </Link>
        <div className="flex items-center gap-3">
          <button className="relative p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error"></span>
          </button>
          <div className="flex items-center gap-2 pl-4 border-l border-border">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-sm">
              O
            </div>
            <span className="text-sm font-medium text-foreground hidden sm:block">Owner Dashboard</span>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
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
          {/* Properties */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-poppins text-lg font-bold">My Properties</h2>
              <Button size="sm" className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> Add Property
              </Button>
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
                          <p className="text-sm text-muted-foreground">Jaipur, Rajasthan · 3 rooms</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                          <ShieldCheck className="h-3 w-3" /> Approved
                        </span>
                        <Button size="sm" variant="outline">
                          Manage
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Calendar Widget */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Availability Calendar</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-64 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">Dec 2025</div>
                    <p className="text-xs text-muted-foreground mt-2">Calendar view coming soon</p>
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
