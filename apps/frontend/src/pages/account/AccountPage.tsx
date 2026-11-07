import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { Calendar, User as UserIcon, Mail, Bell, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AccountPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState("bookings");

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back to StayNova</Link>
        <div className="flex items-center gap-3">
          <button className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition"><Bell className="h-5 w-5" /></button>
          <div className="flex items-center gap-2 pl-4 border-l border-border">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-sm">{user?.name?.charAt(0) || "U"}</div>
            <span className="text-sm font-medium text-foreground hidden sm:block">{user?.name}</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">{user?.name?.charAt(0) || "U"}</div>
                <div><h3 className="font-semibold">{user?.name}</h3><p className="text-xs text-muted-foreground">{user?.email}</p></div>
              </div>
              <Button variant="outline" className="w-full text-sm" onClick={() => setActiveTab("profile")}><UserIcon className="h-4 w-4 mr-2" /> Profile</Button>
              <Button variant="outline" className="w-full text-sm" onClick={() => setActiveTab("bookings")}><Calendar className="h-4 w-4 mr-2" /> My Bookings</Button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="bookings" onValueChange={(v) => setActiveTab(v as string)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="bookings" className="text-sm font-medium"><Calendar className="h-4 w-4 mr-2" /> My Bookings</TabsTrigger>
                <TabsTrigger value="profile" className="text-sm font-medium"><UserIcon className="h-4 w-4 mr-2" /> Profile</TabsTrigger>
              </TabsList>
              <TabsContent value="bookings" className="space-y-4">
                <div className="flex items-center justify-between mb-4"><h2 className="font-poppins text-lg font-bold">My Bookings</h2></div>
                <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="13" height="8" x="2" y="3" rx="2"/><line x1="2" x2="22" y1="11" y2="11"/><polyline points="8 15 8 21 16 21 16 15"/><line x1="12" y1="15" x2="12" y2="21"/></svg></div>
                  <div><h3 className="font-semibold">Taj Jaipur Palace</h3><p className="text-sm text-muted-foreground">Jaipur, Rajasthan · Dec 10–12, 2025</p></div>
                </div>
                <div className="text-right"><div className="font-bold text-primary">₹10,800</div><span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><polyline points="20 6 9 17 4 12"/></svg> Confirmed</span></div></div>
                <div className="mt-4 flex gap-3">
                  <Button variant="outline" size="sm">View Details</Button>
                  <Button variant="outline" size="sm">Cancel</Button>
                </div></CardContent></Card>
              </TabsContent>
              <TabsContent value="profile" className="space-y-6">
                <h2 className="font-poppins text-lg font-bold">Profile</h2>
                <Card><CardContent className="p-6">
                  <div className="space-y-6">
                    <div><Label className="mb-1">Full Name</Label><Input defaultValue={user?.name || ""} /></div>
                    <div><Label className="mb-1">Email</Label><Input type="email" defaultValue={user?.email || ""} readOnly /></div>
                    <div><Label className="mb-1">Phone Number</Label><Input type="tel" defaultValue="+91 98765 43210" /></div>
                    <div><Label className="mb-1">Change Password</Label><Button variant="outline" size="sm">Change password</Button></div>
                  </div>
                </CardContent></Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
