import { Button, Card, MantineProvider, Stack, Text, TextInput } from "@mantine/core";
import { theme } from "@/lib/theme";

export function ThemedSignupCard() {
  return (
    <MantineProvider theme={theme}>
      <Card maw={360}>
        <Stack>
          <Text fw={600} size="lg">
            Create an account
          </Text>
          <TextInput label="Email" placeholder="you@example.com" />
          <Button onClick={() => console.log("submitted")}>Sign up</Button>
        </Stack>
      </Card>
    </MantineProvider>
  );
}
