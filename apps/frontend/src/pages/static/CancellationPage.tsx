import { Link } from "react-router-dom";

export function CancellationPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back</Link>
      </nav>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="font-poppins text-3xl font-bold mb-6">Cancellation Policy</h1>
        <div className="space-y-6">
          {[
            { name: "Free Cancellation", desc: "Full refund if cancelled up to 24 hours before check-in." },
            { name: "Flexible", desc: "Full refund if cancelled up to 48 hours before check-in; 50% after." },
            { name: "Strict", desc: "50% refund if cancelled up to 14 days before check-in; no refund after." },
            { name: "Non-Refundable", desc: "No refund for cancellations." },
          ].map((item, i) => (
            <Card key={i}>
              <div className="p-5">
                <h3 className="font-semibold">{item.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
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
