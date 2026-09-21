import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/PasswordResetForms";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
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
      <ResetPasswordForm />
    </Suspense>
  );
}
