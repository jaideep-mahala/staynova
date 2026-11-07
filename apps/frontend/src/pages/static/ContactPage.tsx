import { Link } from "react-router-dom";

export function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back</Link>
      </nav>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="font-poppins text-3xl font-bold mb-6">Contact Us</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <h3 className="font-poppins text-xl font-bold mb-4">Get in Touch</h3>
              <p className="text-muted-foreground">Have questions about your booking or need help listing your property? Our support team is here to help.</p>
            </div>
            <div className="space-y-4"><div className="flex items-start gap-3"><div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><span>📧</span></div><div><h4 className="font-semibold">Email</h4><p className="text-muted-foreground">support@staynova.com</p></div></div><div className="flex items-start gap-3"><div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><span>📞</span></div><div><h4 className="font-semibold">Phone</h4><p className="text-muted-foreground">+91 1800 123 4567</p></div></div></div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="font-poppins text-xl font-bold mb-4">Send us a message</h3>
            <form className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Your Name</label><input type="text" className="w-full border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary" /></div>
              <div><label className="block text-sm font-medium mb-1">Email Address</label><input type="email" className="w-full border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary" /></div>
              <div><label className="block text-sm font-medium mb-1">Message</label><textarea rows="4" className="w-full border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary" /></div>
              <Button className="w-full bg-primary text-white py-3">Send Message</Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function Button({ children, className }: { children: React.ReactNode; className?: string }) {
  return <button className={`px-4 py-2 rounded-lg font-medium transition ${className}`}>{children}</button>;
}
// Fixed - using standard button
