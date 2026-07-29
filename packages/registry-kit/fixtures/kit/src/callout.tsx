import { Alert } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";

export interface CalloutProps {
  title?: string;
  children: ReactNode;
  color?: string;
}

export function Callout({ title, children, color = "blue" }: CalloutProps) {
  return (
    <Alert variant="light" color={color} title={title} icon={<IconInfoCircle size={18} />}>
      {children}
    </Alert>
  );
}
