import { Suspense } from "react";
import { CustomerAuthForm } from "@/components/auth/CustomerAuthForm";

export const dynamic = "force-dynamic";

export default function SigninPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-brand-navy text-white">
          <div className="container-page flex min-h-dvh items-center justify-center py-10">
            <div className="app-badge">Loading…</div>
          </div>
        </div>
      }
    >
      <CustomerAuthForm mode="signin" />
    </Suspense>
  );
}
