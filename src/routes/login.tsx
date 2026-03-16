import { useMutation } from "@tanstack/react-query";
import { Bookmark, ExternalLink, Languages, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { LoginForm } from "../components/login-form.tsx";
import { orpc } from "../rpc.ts";

const GITHUB_URL = "https://github.com/hi-ogawa/ytsub-v5";

function MarketingPanel() {
  return (
    <div className="hidden flex-col justify-center bg-muted/50 px-12 lg:flex">
      <div className="max-w-sm space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Zamak</h2>
          <p className="mt-1 text-muted-foreground">
            YouTube dual subtitles for language learners
          </p>
        </div>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-2.5">
            <Languages className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>Dual-language captions side by side</span>
          </li>
          <li className="flex items-start gap-2.5">
            <Bookmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>Bookmark words and phrases from captions</span>
          </li>
          <li className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>AI-assisted vocabulary curation</span>
          </li>
        </ul>
        <div className="pt-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
            Get the Chrome extension
          </a>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const mutation = useMutation(
    orpc.auth.login.mutationOptions({
      onSuccess: () => {
        window.location.href = "/";
      },
      meta: { toastOnError: false },
    }),
  );

  return (
    <div className="flex h-full">
      <MarketingPanel />
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-xs space-y-4">
          <div>
            <h1 className="text-xl font-bold">Log in</h1>
            <p className="mt-1 text-sm text-muted-foreground lg:hidden">
              Zamak — YouTube dual subs for language learners
            </p>
          </div>
          <LoginForm
            mutation={mutation}
            submitLabel="Login"
            errorMessage="Invalid username or password"
            footer={
              <p className="text-center text-sm text-muted-foreground">
                No account?{" "}
                <Link to="/register" className="text-primary underline">
                  Sign up
                </Link>
              </p>
            }
          />
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const mutation = useMutation(
    orpc.auth.register.mutationOptions({
      onSuccess: () => {
        window.location.href = "/";
      },
      meta: { toastOnError: false },
    }),
  );

  return (
    <div className="flex h-full">
      <MarketingPanel />
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-xs space-y-4">
          <div>
            <h1 className="text-xl font-bold">Sign up</h1>
            <p className="mt-1 text-sm text-muted-foreground lg:hidden">
              Zamak — YouTube dual subs for language learners
            </p>
          </div>
          <LoginForm
            mutation={mutation}
            submitLabel="Sign up"
            errorMessage="Registration failed — username may already be taken"
            footer={
              <p className="text-center text-sm text-muted-foreground">
                Have an account?{" "}
                <Link to="/login" className="text-primary underline">
                  Login
                </Link>
              </p>
            }
          />
        </div>
      </div>
    </div>
  );
}
