import { useState } from "react";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";

export function SignupEmailField() {
  const [email, setEmail] = useState("");
  const isValid = email.trim().length === 0 || email.includes("@");

  return (
    <FloatingLabelInput
      label="Email"
      placeholder="you@example.com"
      autoComplete="email"
      value={email}
      onChange={(event) => setEmail(event.currentTarget.value)}
      error={isValid ? undefined : "Enter a valid email address"}
    />
  );
}
