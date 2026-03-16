import { useMutation } from "@tanstack/react-query";
import { LoginForm } from "./login-form.tsx";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog.tsx";

export function LoginDialog({
  open,
  onOpenChange,
  onLogin,
  signUpUrl,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (input: { username: string; password: string }) => Promise<void>;
  signUpUrl?: string;
  description?: React.ReactNode;
}) {
  const mutation = useMutation({
    mutationFn: onLogin,
    onSuccess: () => onOpenChange(false),
    meta: { toastOnError: false },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="login-dialog" className="flex flex-col gap-2">
        <DialogTitle>Sign in</DialogTitle>
        {description && (
          <p className="-mt-2 text-xs text-muted-foreground">{description}</p>
        )}
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
