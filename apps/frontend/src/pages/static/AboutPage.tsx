import { Link } from "react-router-dom";

export function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back</Link>
      </nav>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="font-poppins text-3xl font-bold mb-6">About StayNova</h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-6">
          StayNova is India's premier online marketplace for booking stays. From luxury hotels to cozy homestays,
          we help travellers find their perfect accommodation with instant confirmation and flexible cancellation.
        </p>
        <p className="text-lg text-muted-foreground leading-relaxed mb-6">
          Our platform connects travellers with property owners across 8 major Indian cities including Jaipur,
          Goa, Mumbai, Delhi, Bengaluru, Udaipur, Manali, and Kerala. With over 30 properties and growing,
          we're redefining the booking experience.
        </p>
        <div className="bg-card border border-border rounded-2xl p-6 mt-8">
          <h3 className="font-poppins text-xl font-bold mb-4">Our Mission</h3>
          <p className="text-muted-foreground leading-relaxed">
            To make travel planning seamless, transparent, and rewarding for everyone. Whether you're planning
            a weekend getaway or a month-long stay, StayNova has you covered.
          </p>
        </div>
      </div>
    </div>
  );
}
