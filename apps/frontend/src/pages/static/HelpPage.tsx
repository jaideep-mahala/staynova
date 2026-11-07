import { Link } from "react-router-dom";

export function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back</Link>
      </nav>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="font-poppins text-3xl font-bold mb-6">Help & FAQ</h1>
        <div className="space-y-4">
          {[
            { q: "How do I cancel my booking?", a: "You can cancel your booking from the My Account section. Refund amounts depend on the property's cancellation policy." },
            { q: "How does the 15-minute hold work?", a: "When you reserve a room, it's held for 15 minutes while you complete payment. If payment isn't completed, the room is released." },
            { q: "Are prices inclusive of taxes?", a: "Yes, all prices shown include GST. A 2% service fee is added at checkout." },
            { q: "Can I book for someone else?", a: "Yes, there's a toggle during booking to specify guest details different from the account holder." },
          ].map((item, i) => (
            <Card key={i}>
              <div className="p-4 cursor-pointer" onClick={() => {}}>
                <h3 className="font-semibold mb-2">{item.q}</h3>
                <p className="text-sm text-muted-foreground">{item.a}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="border rounded-xl p-1 bg-white dark:bg-slate-800"><div className="p-4">{children}</div></div>;
}
