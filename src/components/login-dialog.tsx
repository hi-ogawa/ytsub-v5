import { useMutation } from "@tanstack/react-query";
import { LoginForm } from "./login-form.tsx";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog.tsx";

export function LoginDialog({
  open,
  onOpenChange,
  onLogin,
  signUpUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (input: { username: string; password: string }) => Promise<void>;
  signUpUrl?: string;
}) {
  const mutation = useMutation({
    mutationFn: onLogin,
    onSuccess: () => onOpenChange(false),
    meta: { toastOnError: false },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="login-dialog">
        <DialogTitle>Sign in</DialogTitle>
        <LoginForm
          mutation={mutation}
          submitLabel="Sign in"
          errorMessage="Invalid username or password"
          footer={
            signUpUrl && (
              <p className="text-center text-xs text-muted-foreground">
                No account?{" "}
                <a
                  href={signUpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Sign up
                </a>
              </p>
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
