import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { LoginForm } from "../components/login-form.tsx";
import { orpc } from "../rpc.ts";

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
    <div className="mx-auto mt-32 max-w-xs space-y-4">
      <h1 className="text-xl font-bold">Zamak — login</h1>
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
    <div className="mx-auto mt-32 max-w-xs space-y-4">
      <h1 className="text-xl font-bold">Zamak — sign up</h1>
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
  );
}
