import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { HomePage } from "@/pages/HomePage";
import { SearchPage } from "@/pages/SearchPage";
import { PropertyDetailPage } from "@/pages/PropertyDetailPage";
import { AboutPage } from "@/pages/static/AboutPage";
import { ContactPage } from "@/pages/static/ContactPage";
import { HelpPage } from "@/pages/static/HelpPage";
import { TermsPage } from "@/pages/static/TermsPage";
import { PrivacyPage } from "@/pages/static/PrivacyPage";
import { CancellationPage } from "@/pages/static/CancellationPage";
import { NotFoundPage } from "@/pages/static/NotFoundPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { SignupPage } from "@/pages/auth/SignupPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { VerifyEmailPage } from "@/pages/auth/VerifyEmailPage";
import { BookingPage } from "@/pages/BookingPage";
import { BookingConfirmPage } from "@/pages/BookingConfirmPage";
import { AccountPage } from "@/pages/account/AccountPage";
import { OwnerDashboard } from "@/pages/owner/OwnerDashboard";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";

const AuthRoute = ({ children }: any) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated() || !user) return <Navigate to="/login" replace />;
  return children;
};

const GuestRoute = ({ children }: any) => {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated()) return <Navigate to="/" replace />;
  return children;
};

const OwnerRoute = () => <div />;
OwnerRoute.displayName = "OwnerRoute";

const AdminRoute = () => <div />;
AdminRoute.displayName = "AdminRoute";

export function Router() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/properties/:slug" element={<PropertyDetailPage />} />
        <Route path="/static/about" element={<AboutPage />} />
        <Route path="/static/contact" element={<ContactPage />} />
        <Route path="/static/help" element={<HelpPage />} />
        <Route path="/static/terms" element={<TermsPage />} />
        <Route path="/static/privacy" element={<PrivacyPage />} />
        <Route path="/static/cancellation" element={<CancellationPage />} />
        <Route path="*" element={<NotFoundPage />} />
        <Route path="/login" element={<AuthLayout><GuestRoute><LoginPage /></GuestRoute></AuthLayout>} />
        <Route path="/signup" element={<AuthLayout><GuestRoute><SignupPage /></GuestRoute></AuthLayout>} />
        <Route path="/forgot-password" element={<AuthLayout><ForgotPasswordPage /></AuthLayout>} />
        <Route path="/reset-password" element={<AuthLayout><ResetPasswordPage /></AuthLayout>} />
        <Route path="/verify-email" element={<AuthLayout><VerifyEmailPage /></AuthLayout>} />
        <Route path="/booking" element={<AuthRoute><BookingPage /></AuthRoute>} />
        <Route path="/booking/:ref/confirmed" element={<AuthRoute><BookingConfirmPage /></AuthRoute>} />
        <Route path="/account" element={<AuthRoute><AccountPage /></AuthRoute>} />
        <Route path="/owner" element={<OwnerRoute />} />
        <Route path="/admin" element={<AdminRoute />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
