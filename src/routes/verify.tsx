import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
} from "@/lib/otp";
import { toast } from "sonner";

export const Route = createFileRoute("/verify")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Verify your email — GramStore" },
      {
        name: "description",
        content:
          "Enter the 6-digit code we emailed you to finish setting up your GramStore account.",
      },
      { property: "og:title", content: "Verify your email — GramStore" },
      {
        property: "og:description",
        content:
          "Enter the 6-digit code we emailed you to finish setting up your GramStore account.",
      },
    ],
  }),
  component: VerifyPage,
});

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function VerifyPage() {
  const { isAuthenticated, isLoading, verified, verifyOtp, resendOtp } =
    useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(OTP_MAX_ATTEMPTS);
  const [expiresIn, setExpiresIn] = useState(OTP_TTL_SECONDS);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const submittedFor = useRef<string | null>(null);

  // Only three states may act: signed out → /login, verified → /dashboard,
  // unverified → this page. `verified === null` waits for the server answer.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) navigate({ to: "/login", replace: true });
    else if (verified === true) navigate({ to: "/dashboard", replace: true });
  }, [isAuthenticated, isLoading, verified, navigate]);

  const ready = !isLoading && isAuthenticated && verified === false;


  // Code validity countdown (backend expires the OTP after 5 minutes).
  useEffect(() => {
    if (expiresIn <= 0) return;
    const t = setTimeout(() => setExpiresIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [expiresIn]);

  // Resend cooldown mirrors the server-side 30s cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const expired = expiresIn <= 0;
  const blocked = attemptsLeft <= 0;
  const inputDisabled = submitting || expired || blocked;

  const submit = async (value: string) => {
    if (value.length !== OTP_LENGTH || inputDisabled) return;
    submittedFor.current = value;
    setSubmitting(true);
    setError(null);
    try {
      await verifyOtp(value);
      toast.success("Email verified");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const message = err instanceof Error ? err.message : "Verification failed";

      if (status === 429) {
        setAttemptsLeft(0);
        setError("Too many attempts. Request a new code.");
      } else if (status === 410 || /expired/i.test(message)) {
        setExpiresIn(0);
        setError("That code expired. Request a new one.");
      } else if (status === 401 || /invalid|credential/i.test(message)) {
        setAttemptsLeft((n) => Math.max(0, n - 1));
        setError("That code isn't right.");
      } else {
        setError(message);
      }
      setCode("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === OTP_LENGTH && submittedFor.current !== digits) {
      void submit(digits);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      await resendOtp();
      toast.success("A new code is on its way");
      setCode("");
      setError(null);
      setAttemptsLeft(OTP_MAX_ATTEMPTS);
      setExpiresIn(OTP_TTL_SECONDS);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      submittedFor.current = null;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 429) {
        setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
        toast.error("You've requested too many codes. Try again later.");
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't resend code");
      }
    } finally {
      setResending(false);
    }
  };

  if (isLoading || !isAuthenticated || verified) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center px-4">
      <div className="w-full rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Verify your email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a {OTP_LENGTH}-digit code to your email address. Enter it
          below to activate your account.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="otp">Verification code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              value={code}
              disabled={inputDisabled}
              onChange={(e) => handleChange(e.target.value)}
              className="text-center text-2xl tracking-[0.5em]"
              aria-invalid={!!error}
              aria-describedby="otp-status"
            />
            <p id="otp-status" className="min-h-5 text-xs">
              {error ? (
                <span className="text-destructive">{error}</span>
              ) : expired ? (
                <span className="text-muted-foreground">
                  Code expired — request a new one.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Expires in {formatClock(expiresIn)} ·{" "}
                  {attemptsLeft === 1
                    ? "1 attempt left"
                    : `${attemptsLeft} attempts left`}
                </span>
              )}
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={inputDisabled || code.length !== OTP_LENGTH}
          >
            {submitting ? "Verifying…" : "Verify email"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          Didn't get it?{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline disabled:opacity-60 disabled:hover:no-underline"
            onClick={() => void handleResend()}
            disabled={cooldown > 0 || resending}
          >
            {resending
              ? "Sending…"
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : "Resend code"}
          </button>
        </div>
      </div>
    </div>
  );
}
