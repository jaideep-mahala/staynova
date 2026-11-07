import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, User as UserIcon, MapPin } from "lucide-react";

export function BookingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [step, setStep] = useState("details");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(900);
  const [coupon, setCoupon] = useState("");
  const [couponValid, setCouponValid] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);

  const roomId = searchParams.get("roomId") || "";
  const price = Number(searchParams.get("price")) || 4500;
  const nights = 2;
  const subtotal = price * nights;
  const tax = Math.round(subtotal * 0.12);
  const serviceFee = Math.round((subtotal - couponDiscount) * 0.02);
  const total = subtotal + tax + serviceFee - couponDiscount;

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((t) => { if (t <= 1) { clearInterval(interval); return 0; } return t - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(timer / 60);
  const seconds = timer % 60;

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const guestName = formData.get("firstName") || formData.get("guestName") || "Demo User";
      const guestEmail = formData.get("email") || "demo@example.com";
      const guestPhone = formData.get("phone") || "+91";
      const { data } = await api.post("/bookings", {
        propertyId: "prop-1",
        roomTypeId: roomId,
        checkIn: "2025-12-10",
        checkOut: "2025-12-12",
        adults: 2,
        children: 0,
        roomsCount: 1,
        couponCode: couponValid ? coupon : undefined,
        guestName,
        guestEmail,
        guestPhone,
      });
      setStep("payment");
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCouponApply = async () => {
    try {
      const { data } = await api.post("/coupons/validate", { code: coupon });
      setCouponValid(true);
      setCouponDiscount(data.data.discountPaise || 2000);
    } catch {
      setCouponValid(false);
    }
  };

  const handlePay = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/payments/verify", {
        razorpay_order_id: "mock_order",
        razorpay_payment_id: "mock_payment",
        razorpay_signature: "mock_signature",
      });
      navigate(`/booking/${data.data.bookingId}/confirmed`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  if (timer === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center shadow-card">
          <CardContent className="p-8">
            <Clock className="h-12 w-12 text-error mx-auto mb-4" />
            <CardTitle>Hold expired</CardTitle>
            <p className="text-muted-foreground mb-6">Your 15-minute hold has expired. The room has been released.</p>
            <Button className="w-full" onClick={() => {
              const params = new URLSearchParams();
              params.set("roomId", roomId);
              params.set("price", String(price));
              navigate(`/booking?${params.toString()}`);
            }}>Start New Booking</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back to property</Link>
      </nav>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><UserIcon className="h-5 w-5" /> Guest Details</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <form onSubmit={handleBooking} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2"><Label htmlFor="firstName">First Name</Label><Input id="firstName" type="text" required defaultValue={user?.name?.split(" ")[0] || ""} /></div>
                    <div className="space-y-2"><Label htmlFor="lastName">Last Name</Label><Input id="lastName" type="text" required defaultValue={user?.name?.split(" ")[1] || ""} /></div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" required defaultValue={user?.email || ""} /></div>
                  <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" required defaultValue="+91" /></div>
                  <div className="space-y-2"><div className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="accent-primary" /><span className="text-sm">I am booking for someone else</span></div></div>
                  <div className="space-y-2"><div className="flex items-center justify-between"><Label>Promo code</Label><button onClick={handleCouponApply} disabled={loading || couponValid} className="text-xs text-primary hover:text-primary-hover font-medium">Apply</button></div>
                  <div className="relative"><Input id="coupon" type="text" placeholder="Enter promo code" value={coupon} onChange={(e) => setCoupon(e.target.value)} disabled={couponValid} className="pr-12" />{couponValid && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600 font-medium">Applied -{formatPrice(couponDiscount)}</span>}</div></div>
                  {error && <p className="text-sm text-error">{error}</p>}
                  <Button type="submit" className="w-full py-4 text-lg font-semibold" disabled={loading}>{loading ? "Processing..." : `Reserve Room · ${minutes}:${seconds.toString().padStart(2, "0")} hold`}</Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-24"><CardContent className="p-6">
              <div className="flex items-center justify-between mb-6"><span className="text-sm font-medium">Your booking</span><div className="flex items-center gap-1"><Clock className="h-4 w-5 text-error" /><span className="text-sm font-mono font-bold text-error">{minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}</span></div></div>
              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Room rate × {nights} nights</span><span>{formatPrice(subtotal)}</span></div>
                {couponDiscount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span className="text-green-600 font-medium">-{formatPrice(couponDiscount)}</span></div>}
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Taxes (12% GST)</span><span>{formatPrice(tax)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Service fee</span><span>{formatPrice(serviceFee)}</span></div>
                <div className="flex justify-between text-lg font-bold border-t pt-3"><span>Total to pay</span><span className="text-primary">{formatPrice(total)}</span></div>
              </div>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 mb-6"><div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-primary mt-0.5" /><div className="text-sm"><div className="font-medium">Taj Jaipur Palace</div><div className="text-muted-foreground text-xs">Jaipur, Rajasthan · Dec 10–12, 2025</div></div></div></div>
              <p className="text-xs text-muted-foreground mb-6">Free cancellation up to 24 hours before check-in.</p>
              <Button className="w-full py-4 bg-primary text-white text-lg font-semibold hover:bg-primary-hover transition" onClick={handlePay} disabled={loading || timer === 0}>{loading ? "Processing..." : `Pay ${Math.floor(total / 100)} via Razorpay`}</Button>
              <div className="pt-4 border-t border-border"><p className="text-xs text-muted-foreground text-center">Secured by Razorpay · UPI / Cards / Netbanking</p></div>
            </CardContent></Card>
          </div>
        </div>
      </div>
    </div>
  );
}
