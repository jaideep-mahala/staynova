import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Download, Calendar, MapPin, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function BookingConfirmPage() {
  const { ref } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-card text-center">
        <CardContent className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-poppins mb-2">Booking Confirmed!</CardTitle>
          <p className="text-muted-foreground mb-6">
            Your stay has been booked successfully. Here are your details.
          </p>

          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground text-sm">Booking Reference</span>
              <span className="font-mono font-bold text-primary">SN-{ref?.toUpperCase() || "XXXXXX"}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground text-sm">Property</span>
              <span className="font-medium">Taj Jaipur Palace</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground text-sm">Check-in</span>
              <span className="font-medium">Dec 10, 2025 · 3:00 PM</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground text-sm">Check-out</span>
              <span className="font-medium">Dec 12, 2025 · 11:00 AM</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground text-sm">Guests</span>
              <span className="font-medium">2 adults</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 font-bold text-primary">
              <span className="text-muted-foreground text-sm">Total Paid</span>
              <span>₹10,800</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = `/api/v1/bookings/${ref}/voucher`;
              }}
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" /> Download Voucher
            </Button>
            <Button variant="outline" className="w-full">
              <Calendar className="h-4 w-4 mr-2" /> Add to Calendar
            </Button>
          </div>

          <div className="space-y-3">
            <Button className="w-full" onClick={() => navigate("/account")}>
              Manage Booking
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
              Explore More Stays
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
