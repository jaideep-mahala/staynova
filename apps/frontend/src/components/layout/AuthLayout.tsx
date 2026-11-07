import { Outlet } from "react-router-dom";
import { Image } from "lucide-react";

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="bg-primary p-3 rounded-2xl">
            <div className="text-white text-2xl font-bold">SN</div>
          </div>
        </div>
        <Outlet />
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            StayNova — Find your next stay.
          </p>
        </div>
      </div>
    </div>
  );
}
