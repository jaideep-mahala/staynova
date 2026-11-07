import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import {
  Menu, X, Search, MapPin, Calendar, Users, Bell, User, Plus, ChevronRight,
  Moon, Sun, LayoutDashboard, Building2, ShieldCheck, Command
} from "lucide-react";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const isAuthPage = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"].includes(location.pathname);

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex shrink-0 items-center gap-3">
              <div className="bg-primary p-2 rounded-xl">
                <div className="text-white text-xl font-bold">SN</div>
              </div>
              <span className="font-poppins font-bold text-xl tracking-tight text-foreground">
                StayNova
              </span>
            </div>

            {!isAuthPage && (
              <div className="hidden md:flex items-center gap-8">
                <Link to="/" className="text-sm font-medium text-foreground hover:text-primary transition">Home</Link>
                <Link to="/search" className="text-sm font-medium text-foreground hover:text-primary transition">Stays</Link>
                <Link to="/account" className="text-sm font-medium text-foreground hover:text-primary transition">My Account</Link>
              </div>
            )}

            <div className="flex items-center gap-3">
              {!user ? (
                <>
                  <Link to="/login" className="text-sm font-medium text-foreground hover:text-primary">Log in</Link>
                  <Link to="/signup" className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-hover transition">Sign up</Link>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate("/account")}
                    className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition"
                    aria-label="Profile"
                  >
                    <User className="h-5 w-5" />
                  </button>
                  {user.role === "OWNER" || user.role === "ADMIN" ? (
                    <Link
                      to={user.role === "ADMIN" ? "/admin" : "/owner"}
                      className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-hover transition"
                    >
                      {user.role === "ADMIN" ? "Admin" : "Owner"} Dashboard
                    </Link>
                  ) : null}
                  <button
                    onClick={() => { logout(); navigate("/login"); }}
                    className="px-4 py-2 text-sm font-semibold text-error-foreground bg-error/10 hover:bg-error/20 rounded-xl transition border border-error/20"
                  >
                    Sign out
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition"
              aria-label="Menu"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="md:hidden border-t border-border bg-background p-4 space-y-4">
            <Link
              to="/"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-xl transition"
            >
              Home
            </Link>
            <Link
              to="/search"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-xl transition"
            >
              Stays
            </Link>
            {user ? (
              <>
                <Link
                  to="/account"
                  onClick={() => setIsOpen(false)}
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-xl transition"
                >
                  My Account
                </Link>
                {(user.role === "OWNER" || user.role === "ADMIN") && (
                  <Link
                    to={user.role === "ADMIN" ? "/admin" : "/owner"}
                    onClick={() => setIsOpen(false)}
                    className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-xl transition"
                  >
                    {user.role === "ADMIN" ? "Admin" : "Owner"} Dashboard
                  </Link>
                )}
                <button
                  onClick={() => { logout(); navigate("/login"); setIsOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm font-semibold text-error-foreground bg-error/10 hover:bg-error/20 rounded-xl transition border border-error/20"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setIsOpen(false)}
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-xl transition"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setIsOpen(false)}
                  className="block px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary-hover transition text-center"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        )}
      </nav>
    </>
  );
}
