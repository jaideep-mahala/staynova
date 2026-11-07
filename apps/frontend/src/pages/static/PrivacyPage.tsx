import { Link } from "react-router-dom";

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-background border-b border-border px-4 py-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back</Link>
      </nav>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="font-poppins text-3xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-muted-foreground">Your privacy is important to us. This policy explains how we collect and use your data.</p>
        <div className="mt-6 space-y-4"><div className="font-poppins font-bold">Information We Collect</div><p className="text-muted-foreground">We collect your name, email, phone, and booking details to provide our services.</p><div className="font-poppins font-bold mt-4">Data Security</div><p className="text-muted-foreground">All data is encrypted and stored securely. We never share your payment details.</p></div>
      </div>
    </div>
  );
}
