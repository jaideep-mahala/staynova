import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, MapPin, Calendar, Users, ArrowRight, Star, ShieldCheck, Wifi, BedDouble } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DESTINATIONS = [
  { name: "Jaipur", image: "https://images.unsplash.com/photo-1570132273250-d729ab307ff4?w=600&q=80", count: 45 },
  { name: "Goa", image: "https://images.unsplash.com/photo-1517428201797-139191e8d866?w=600&q=80", count: 120 },
  { name: "Mumbai", image: "https://images.unsplash.com/photo-1553954412-a191e2243892?w=600&q=80", count: 89 },
  { name: "Delhi", image: "https://images.unsplash.com/photo-1564479906447-a8b533f0e4c8?w=600&q=80", count: 67 },
  { name: "Bengaluru", image: "https://images.unsplash.com/photo-1512917774381-7ae8e07b7f55?w=600&q=80", count: 54 },
  { name: "Udaipur", image: "https://images.unsplash.com/photo-1552637412-a4506411e0a4?w=600&q=80", count: 38 },
];

export function HomePage() {
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("2");

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative pt-20 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1551882744-df5188104f05?w=1920&q=80')] bg-cover bg-center opacity-40" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-poppins text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Find your next stay.
          </h1>
          <p className="text-white/90 text-lg md:text-xl mb-10 max-w-2xl mx-auto">
            Discover hotels, resorts, villas, and homestays across India with
            instant confirmation and flexible cancellation.
          </p>
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-1 md:p-2 shadow-2xl max-w-4xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const params = new URLSearchParams();
                if (destination) params.set("destination", destination);
                if (checkIn) params.set("checkIn", checkIn);
                if (checkOut) params.set("checkOut", checkOut);
                if (guests) params.set("adults", guests);
                window.location.href = `/search?${params.toString()}`;
              }}
              className="grid grid-cols-1 md:grid-cols-5 gap-3"
            >
              <div className="flex items-end gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <Input
                  placeholder="Where to?"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="bg-white/5 text-white border-white/20 focus:border-primary placeholder-white/60"
                />
              </div>
              <div className="flex items-end gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <Input
                  type="date"
                  placeholder="Check-in"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="bg-white/5 text-white border-white/20 focus:border-primary placeholder-white/60"
                />
              </div>
              <div className="flex items-end gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <Input
                  type="date"
                  placeholder="Check-out"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="bg-white/5 text-white border-white/20 focus:border-primary placeholder-white/60"
                />
              </div>
              <div className="flex items-end gap-2">
                <Users className="h-5 w-5 text-primary" />
                <Input
                  type="number"
                  placeholder="Guests"
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  className="bg-white/5 text-white border-white/20 focus:border-primary placeholder-white/60 w-20"
                />
              </div>
              <button className="bg-primary text-white px-8 py-4 rounded-xl font-semibold hover:bg-primary-hover transition flex items-center gap-2">
                Search <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Popular Destinations */}
      <section className="py-16 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-10">
            <h2 className="font-poppins text-2xl font-bold">Popular Destinations</h2>
            <Link to="/search" className="text-primary text-sm font-medium hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            {DESTINATIONS.map((d) => (
              <Link
                key={d.name}
                to={`/search?destination=${d.name}`}
                className="group block"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden mb-3">
                  <img
                    src={d.image}
                    alt={d.name}
                    className="w-full h-full object-cover transition group-hover:scale-105 duration-300"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-1">
                    <MapPin className="h-4 w-5 text-white" />
                    <span className="text-sm font-medium text-white">{d.count} stays</span>
                  </div>
                </div>
                <h3 className="font-poppins font-semibold">{d.name}</h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-10 border-t border-border bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-8 text-center">
            {[
              { icon: ShieldCheck, label: "Verified Properties" },
              { icon: Wifi, label: "Free Wi-Fi" },
              { icon: Pool, label: "Swimming Pools" },
              { icon: BedDouble, label: "24/7 Support" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-2">
                <item.icon className="h-6 w-5 text-primary" />
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Properties */}
      <section className="py-16 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-10">
            <h2 className="font-poppins text-2xl font-bold">Featured Stays</h2>
            <Link to="/search" className="text-primary text-sm font-medium hover:underline">
              View all stays →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="hover:shadow-card transition group">
                <div className="aspect-video rounded-xl overflow-hidden mb-4 relative">
                  <img
                    src={`https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80&sig=${i}`}
                    alt="Property"
                    className="w-full h-full object-cover transition group-hover:scale-105 duration-300"
                  />
                  <div className="absolute top-3 right-3 bg-amber-500 text-xs px-2 py-1 rounded-lg text-amber-foreground font-medium animate-pulse">
                    Hot Deal
                  </div>
                </div>
                <CardHeader>
                  <CardTitle className="text-lg">Luxury Resort {i}</CardTitle>
                  <div className="flex items-center gap-1 mt-2">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium">4.8</span>
                    <span className="text-xs text-muted-foreground">(124 reviews)</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-muted-foreground">Jaipur, Rajasthan</span>
                    <span className="text-sm font-semibold text-primary">₹4,500/night</span>
                  </div>
                  <Link to={`/properties/hotel-${i}`} className="w-full py-3 bg-primary text-white text-center rounded-xl font-semibold hover:bg-primary-hover transition">
                    Book Now
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
