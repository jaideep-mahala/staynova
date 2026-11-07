import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { Filter, Map, X, Plus, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FILTERS = [
  { id: "price", label: "Price", type: "range", min: 1000, max: 20000 },
  { id: "stars", label: "Star Rating", type: "select", options: [5, 4, 3] },
  { id: "amenities", label: "Amenities", type: "multi", options: ["Wi-Fi", "Pool", "Spa", "Breakfast", "Parking", "Gym"] },
  { id: "type", label: "Property Type", type: "multi", options: ["Hotel", "Resort", "Villa", "Homestay", "Hostel", "Apartment"] },
];

const MOCK_PROPERTIES = [
  { id: "1", name: "Taj Jaipur Palace", city: "Jaipur", type: "HOTEL", stars: 5, price: 8500, rating: 4.8, reviews: 340, image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500&q=80", amenities: ["Wi-Fi", "Pool", "Spa"] },
  { id: "2", name: "Goa Beach Resort", city: "Goa", type: "RESORT", stars: 4, price: 6200, rating: 4.6, reviews: 180, image: "https://images.unsplash.com/photo-1517428201797-139191e8d866?w=500&q=80", amenities: ["Wi-Fi", "Pool", "Breakfast"] },
  { id: "3", name: "Mumbai Central Hotel", city: "Mumbai", type: "HOTEL", stars: 4, price: 5500, rating: 4.4, reviews: 210, image: "https://images.unsplash.com/photo-1553954412-a191e2243892?w=500&q=80", amenities: ["Wi-Fi", "Parking"] },
  { id: "4", name: "Delhi Heritage Stay", city: "Delhi", type: "HERITAGE", stars: 5, price: 9200, rating: 4.9, reviews: 95, image: "https://images.unsplash.com/photo-1564479906447-a8b533f0e4c8?w=500&q=80", amenities: ["Wi-Fi", "Spa", "Breakfast"] },
  { id: "5", name: "Bengaluru Garden Villa", city: "Bengaluru", type: "VILLA", stars: 4, price: 7100, rating: 4.7, reviews: 156, image: "https://images.unsplash.com/photo-1512917774381-7ae8e07b7f55?w=500&q=80", amenities: ["Wi-Fi", "Pool", "Gym"] },
  { id: "6", name: "Udaipur Lake Palace", city: "Udaipur", type: "RESORT", stars: 5, price: 11500, rating: 4.9, reviews: 89, image: "https://images.unsplash.com/photo-1552637412-a4506411e0a4?w=500&q=80", amenities: ["Wi-Fi", "Pool", "Spa", "Breakfast"] },
];

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const [mapView, setMapView] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});

  const destination = searchParams.get("destination") || "";
  const checkIn = searchParams.get("checkIn") || "";
  const checkOut = searchParams.get("checkOut") || "";
  const adults = searchParams.get("adults") || "1";

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b border-border sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-poppins text-xl font-bold">{destination || "All Destinations"}</h1>
              <p className="text-sm text-muted-foreground">{checkIn && checkOut ? `${checkIn} → ${checkOut}` : ""} · {adults} guest{adults !== "1" ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setMapView(!mapView)} className={`p-2 rounded-lg ${mapView ? "bg-primary text-white" : "bg-background text-foreground border border-border"} transition`} aria-label="Map view">
                {mapView ? <div className="w-5 h-5" /> : <Map className="h-5 w-5" />}
              </button>
              <button onClick={() => setFiltersOpen(!filtersOpen)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted transition">
                <Filter className="h-4 w-5 text-primary" /> Filters
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-medium text-foreground">{MOCK_PROPERTIES.length} stays found</span>
            <div className="flex items-center gap-2 text-sm">
              <select defaultValue="recommended" className="ml-1 text-sm bg-transparent border-none focus:outline-none">
                <option>Recommended</option>
                <option>Price: Low to High</option>
                <option>Price: High to Low</option>
                <option>Rating</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 bg-background flex md:hidden">
          <div className="w-full max-w-md h-full border-l border-border bg-card shadow-2xl flex flex-col">
            <div className="p-6 border-b border-border">
              <h2 className="font-poppins font-bold text-lg mb-6">Filters</h2>
              <button onClick={() => setFiltersOpen(false)} className="text-right text-sm text-muted-foreground hover:text-foreground">Done</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {FILTERS.map((f) => (
                <div key={f.id} className="mb-8">
                  <h3 className="font-semibold mb-3">{f.label}</h3>
                  {f.type === "range" && (
                    <div className="space-y-2"><div className="flex justify-between text-xs text-muted-foreground"><span>₹{f.min}</span><span>₹{f.max}+</span></div><input type="range" min={f.min} max={f.max} defaultValue={f.min} className="w-full accent-primary" /></div>
                  )}
                  {f.type === "select" && (
                    <div className="space-y-2">{f.options.map((o) => <label key={o} className="flex items-center gap-3 cursor-pointer"><input type="radio" name={`filter-${f.id}`} className="accent-primary" /><span>{o} Star</span></label>)}</div>
                  )}
                  {f.type === "multi" && (
                    <div className="space-y-2">{f.options.map((o) => <label key={o} className="flex items-center gap-3 cursor-pointer"><input type="checkbox" className="accent-primary" /><span>{o}</span></label>)}</div>
                  )}
                </div>
              ))}
              <Button className="w-full bg-primary text-white" onClick={() => setFiltersOpen(false)}>Apply Filters</Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {MOCK_PROPERTIES.map((p) => (
              <Card key={p.id} className="hover:shadow-card transition group cursor-pointer">
                <div className="aspect-video rounded-xl overflow-hidden mb-4 relative">
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover transition group-hover:scale-105 duration-300" />
                  <div className="absolute top-3 right-3 bg-amber-100 text-xs px-2 py-1 rounded-lg text-amber-800 font-medium">Scarcity: Only 2 rooms left</div>
                  <div className="absolute bottom-3 left-3 bg-black/60 text-white px-3 py-1 rounded-lg text-sm font-medium">{p.stars}★</div>
                </div>
                <div className="p-0">
                  <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{p.name}</h3><span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">{p.type}</span></div>
                  <p className="text-sm text-muted-foreground mb-3">{p.city}, India</p>
                  <div className="flex items-center gap-2 mb-3"><span className="text-lg font-bold text-primary">₹{p.price}/night</span><span className="text-xs text-muted-foreground">· {p.reviews} reviews</span></div>
                  <div className="flex gap-2 mb-4">{p.amenities.map((a) => <span key={a} className="text-xs bg-muted px-2 py-1 rounded-full">{a}</span>)}</div>
                  <Link to={`/properties/${p.id.toLowerCase().replace(/\s+/g, "-")}`} className="w-full py-3 bg-primary text-white text-center rounded-xl font-semibold hover:bg-primary-hover transition">View Details</Link>
                </div>
              </Card>
            ))}
          </div>

          {mapView && <div className="lg:col-span-3 h-[500px] rounded-2xl border border-border overflow-hidden mb-8"><div className="w-full h-full bg-muted flex items-center justify-center"><p className="text-muted-foreground">Map view coming soon</p></div></div>}
        </div>
      </div>
    </div>
  );
}

// Remove f.options issue by checking if defined
// Fix: filter options are defined, no runtime issue
