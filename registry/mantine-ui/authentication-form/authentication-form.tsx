/**
 * Adapted from Mantine UI's AuthenticationForm at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 *
 * Curated deviation from upstream: the terms-and-conditions checkbox defaults to
 * unchecked here (`initialTerms` prop, default `false`). Upstream initializes it
 * `true`, which renders a pre-checked consent checkbox with no user action — a
 * dark pattern this registry does not ship by default.
 */
import {
  Anchor,
  Button,
  Checkbox,
  Divider,
  Group,
  Paper,
  type PaperProps,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { upperFirst, useToggle } from "@mantine/hooks";

import { GithubButton } from "./github-button";
import { GoogleButton } from "./google-button";

export type AuthenticationMode = "login" | "register";

export interface AuthenticationValues {
  email: string;
  name: string;
  password: string;
  terms: boolean;
}

export interface AuthenticationFormProps extends PaperProps {
  initialMode?: AuthenticationMode;
  heading?: string;
  /** Initial checked state of the terms-and-conditions checkbox. Defaults to `false` — the box
   * must never render pre-checked without the consumer opting in explicitly. */
  initialTerms?: boolean;
  onSubmit?: (values: AuthenticationValues, mode: AuthenticationMode) => void;
  onGoogle?: () => void;
  onGithub?: () => void;
}

export function AuthenticationForm({
  initialMode = "login",
  heading = "Welcome",
  initialTerms = false,
  onSubmit,
  onGoogle,
  onGithub,
  ...paperProps
}: AuthenticationFormProps) {
  const alternateMode: AuthenticationMode = initialMode === "login" ? "register" : "login";
  const [mode, toggle] = useToggle<AuthenticationMode>([initialMode, alternateMode]);
  const hasSocialLogin = Boolean(onGoogle || onGithub);
  const form = useForm<AuthenticationValues>({
    initialValues: { email: "", name: "", password: "", terms: initialTerms },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : "Enter a valid email address"),
      password: (value) =>
        value.length >= 7 ? null : "Password should include at least 7 characters",
    },
  });

  return (
    <Paper radius="md" p="lg" withBorder {...paperProps}>
      <Text size="lg" fw={500} c="bright">
        {heading}, {mode} with
      </Text>

      {hasSocialLogin && (
        <>
          <Group grow mb="md" mt="md">
            {onGoogle && (
              <GoogleButton radius="xl" onClick={onGoogle}>
                Google
              </GoogleButton>
            )}
            {onGithub && (
              <GithubButton radius="xl" onClick={onGithub}>
                GitHub
              </GithubButton>
            )}
          </Group>

          <Divider
            label="Or continue with email"
            labelPosition="center"
            my="lg"
            styles={{ label: { color: "var(--mantine-color-bright)", opacity: 0.85 } }}
          />
        </>
      )}

      <form onSubmit={form.onSubmit((values) => onSubmit?.(values, mode))}>
        <Stack>
          {mode === "register" && (
            <TextInput
              label="Name"
              placeholder="Enter your name"
              key={form.key("name")}
              {...form.getInputProps("name")}
              radius="md"
              styles={{ input: { fontSize: "var(--mantine-font-size-sm)" } }}
            />
          )}

          <TextInput
            required
            label="Email"
            placeholder="Enter your email"
            key={form.key("email")}
            {...form.getInputProps("email")}
            radius="md"
            styles={{ input: { fontSize: "var(--mantine-font-size-sm)" } }}
          />

          <PasswordInput
            required
            label="Password"
            placeholder="Enter your password"
            key={form.key("password")}
            {...form.getInputProps("password")}
            radius="md"
            styles={{ innerInput: { fontSize: "var(--mantine-font-size-sm)" } }}
          />

          {mode === "register" && (
            <Checkbox
              label="I accept the terms and conditions"
              key={form.key("terms")}
              {...form.getInputProps("terms", { type: "checkbox" })}
            />
          )}
        </Stack>

        <Group justify="space-between" mt="xl">
          <Anchor
            component="button"
            type="button"
            c="bright"
            opacity={0.85}
            onClick={() => toggle()}
            size="xs"
          >
            {mode === "register"
              ? "Already have an account? Login"
              : "Don't have an account? Register"}
          </Anchor>
          <Button type="submit" radius="xl" color="blue.9">
            {upperFirst(mode)}
          </Button>
        </Group>
      </form>
    </Paper>
  );
}
