import { Link } from "react-router-dom";

export function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back</Link>
      </nav>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="font-poppins text-3xl font-bold mb-6">Terms of Service</h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-6">Welcome to StayNova. By using our platform, you agree to these terms.</p>
        <div className="space-y-4"><div className="font-poppins font-bold mt-6 mb-2">1. Booking Terms</div><p className="text-muted-foreground">All bookings are subject to availability and confirmation by the property owner.</p><div className="font-poppins font-bold mt-6 mb-2">2. Payments</div><p className="text-muted-foreground">Payments are processed through Razorpay. All amounts are in INR.</p></div>
      </div>
    </div>
  );
}
