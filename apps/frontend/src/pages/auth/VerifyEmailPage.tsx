import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
    }
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-card text-center">
        <CardContent className="p-8">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <CardTitle>Email verified!</CardTitle>
          <CardDescription>
            Your email has been verified successfully. You can now sign in to your account.
          </CardDescription>
          <Button className="w-full mt-6" onClick={() => navigate("/login")}>
            Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
