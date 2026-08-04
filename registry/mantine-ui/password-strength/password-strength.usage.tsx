import { PasswordStrength } from "@ui/password-strength";

export function SignupPasswordField() {
  return (
    <PasswordStrength
      label="Choose a password"
      placeholder="At least 6 characters"
      minLength={8}
      onChange={(value) => console.log("password value", value)}
    />
  );
}
