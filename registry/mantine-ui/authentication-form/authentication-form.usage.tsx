import { AuthenticationForm } from "@/components/ui/authentication-form";

export function AccountSignIn() {
  return (
    <AuthenticationForm
      heading="Welcome back"
      onSubmit={(values, mode) => console.log("submit", values, mode)}
      onGoogle={() => console.log("continue with google")}
      onGithub={() => console.log("continue with github")}
    />
  );
}
