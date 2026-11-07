import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="text-center max-w-md">
        <h1 className="font-poppins text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-xl font-semibold mb-2">Page not found</h2>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist.
        </p>
        <Link to="/" className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-hover transition">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
