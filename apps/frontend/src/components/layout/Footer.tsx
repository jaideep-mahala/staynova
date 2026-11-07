import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <h3 className="font-poppins font-bold text-lg mb-4">StayNova</h3>
            <p className="text-sm text-muted-foreground">
              Find your next stay. The simplest way to book hotels, resorts, villas, and homestays across India.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Explore</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-primary transition">Home</Link></li>
              <li><Link to="/search" className="hover:text-primary transition">Stays</Link></li>
              <li><Link to="/static/about" className="hover:text-primary transition">About</Link></li>
              <li><Link to="/static/contact" className="hover:text-primary transition">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/static/help" className="hover:text-primary transition">Help & FAQ</Link></li>
              <li><Link to="/account" className="hover:text-primary transition">My Bookings</Link></li>
              <li><Link to="/static/terms" className="hover:text-primary transition">Terms of Service</Link></li>
              <li><Link to="/static/privacy" className="hover:text-primary transition">Privacy Policy</Link></li>
              <li><Link to="/static/cancellation" className="hover:text-primary transition">Cancellation Policy</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">For Property Owners</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/owner" className="hover:text-primary transition">Owner Dashboard</Link></li>
              <li><Link to="/static/contact" className="hover:text-primary transition">List Your Property</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border pt-8">
          <p className="text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} StayNova. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
