import { useParams } from "react-router-dom";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { MapPin, Star, Wifi, Building2, Share2, ChevronLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ROOM_TYPES = [
  { id: "1", name: "Deluxe Room", capacity: "2 guests · 1 king bed", size: "280 sq ft", price: 4500, available: 5, image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500&q=80" },
  { id: "2", name: "Executive Suite", capacity: "4 guests · 1 king bed", size: "420 sq ft", price: 7200, available: 2, image: "https://images.unsplash.com/photo-1590480331666-c2847f7b6f5b?w=500&q=80" },
  { id: "3", name: "Family Room", capacity: "6 guests · 2 queen beds", size: "380 sq ft", price: 6100, available: 3, image: "https://images.unsplash.com/photo-1578582677467-e483c98266e6?w=500&q=80" },
];

export function PropertyDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [selectedRoom, setSelectedRoom] = useState(ROOM_TYPES[0] as any);

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-poppins font-bold text-lg">Property Details</h1>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden mb-6 shadow-lg">
          <img src={`https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80`} alt={slug} className="w-full h-full object-cover" />
          <div className="absolute top-4 right-4 flex gap-2">
            <Button variant="outline" size="icon" className="bg-white/90 backdrop-blur">
              <Share2 className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="icon" className="bg-white/90 backdrop-blur">
              <Star className="h-5 w-5" />
            </Button>
          </div>
          <div className="absolute bottom-4 left-4 flex gap-2">
            <Button variant="outline" size="sm" className="bg-white/90 backdrop-blur text-xs">
              <MapPin className="h-4 w-4 mr-1" /> Jaipur
            </Button>
            <Button variant="outline" size="sm" className="bg-white/90 backdrop-blur text-xs">
              <Building2 className="h-4 w-4 mr-1" /> Heritage
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold mb-2">
                  5 Star · Heritage
                </span>
                <h1 className="font-poppins text-3xl font-bold mb-2">Taj Jaipur Palace</h1>
                <p className="text-muted-foreground text-lg">
                  Experience royal hospitality in the heart of Jaipur with world-class amenities and heritage architecture.
                </p>
              </div>
              <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                <div>
                  <div className="text-lg font-bold">4.8</div>
                  <div className="text-xs text-amber-700">340 reviews</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {["Wi-Fi", "Pool", "Spa", "Breakfast", "Parking", "Gym", "AC", "Room Service"].map((a) => (
                <div key={a} className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Wifi className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">{a}</span>
                </div>
              ))}
            </div>

            <div>
              <h2 className="font-poppins text-xl font-bold mb-4">Choose Your Room</h2>
              <div className="space-y-4">
                {ROOM_TYPES.map((room) => (
                  <Card key={room.id}
                    className={`cursor-pointer p-4 transition border ${selectedRoom.id === room.id ? "border-primary bg-primary/5" : "border-border hover:border-muted/50"}`}
                    onClick={() => setSelectedRoom(room)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <img src={room.image} alt={room.name} className="w-16 h-16 rounded-xl object-cover" />
                        <div>
                          <h3 className="font-semibold">{room.name}</h3>
                          <p className="text-sm text-muted-foreground">{room.capacity} · {room.size}</p>
                        </div>
                      </div>
                      <span className="text-lg font-bold text-primary">₹{room.price}/night</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{room.available} rooms available</span>
                      <Button size="sm" variant={selectedRoom.id === room.id ? "default" : "outline"} disabled={room.available === 0}>
                        Select
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Cancellation Policy</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Flexible Cancellation</h3>
                    <p className="text-sm text-muted-foreground">Free cancellation up to 24 hours before check-in. Full refund.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium">Selected Room</span>
                  <span className="text-sm font-semibold">{selectedRoom?.name}</span>
                </div>
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Room rate × 2 nights</span>
                    <span>₹{selectedRoom?.price * 2}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Taxes & fees</span>
                    <span>₹900</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-3">
                    <span>Total</span>
                    <span className="text-primary">₹{selectedRoom?.price * 2 + 900}</span>
                  </div>
                </div>
                <Button
                  className="w-full py-4 text-lg font-semibold"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("roomId", selectedRoom.id);
                    params.set("price", String(selectedRoom.price));
                    navigate(`/booking?${params.toString()}`);
                  }}
                >
                  Reserve Now
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-4">15-minute hold on your room</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
