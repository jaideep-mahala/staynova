import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "USER" | "OWNER" | "ADMIN";
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem("refreshToken", refreshToken);
        set({ user, accessToken });
      },
      logout: () => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        set({ user: null, accessToken: null });
      },
      isAuthenticated: () => !!localStorage.getItem("accessToken"),
    }),
    { name: "auth-storage", partialize: (s) => ({ user: s.user, accessToken: s.accessToken }) }
  )
);
