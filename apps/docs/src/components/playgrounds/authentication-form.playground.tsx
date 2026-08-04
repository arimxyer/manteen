import { AuthenticationForm } from "../../../../../registry/mantine-ui/authentication-form/authentication-form";
import type { PlaygroundAdapter } from "./contract";

const adapter: PlaygroundAdapter = {
  item: "authentication-form",
  defaultProps: {
    heading: "Welcome back",
    initialMode: "login",
    social: true,
  },
  controls: [
    { kind: "text", prop: "heading", label: "Heading", wide: true },
    {
      kind: "select",
      prop: "initialMode",
      label: "Initial mode",
      options: [
        { label: "Login", value: "login" },
        { label: "Register", value: "register" },
      ],
    },
    { kind: "switch", prop: "social", label: "Social login" },
  ],
  render: (props, recordEvent) => (
    <AuthenticationForm
      key={String(props.initialMode)}
      heading={String(props.heading) || "Welcome"}
      initialMode={props.initialMode === "register" ? "register" : "login"}
      onSubmit={(values, mode) => recordEvent(`onSubmit (${mode}: ${values.email})`)}
      onGoogle={props.social ? () => recordEvent("onGoogle") : undefined}
      onGithub={props.social ? () => recordEvent("onGithub") : undefined}
    />
  ),
  renderJsx: (props) => {
    const socialProps = props.social ? "\n  onGoogle={() => {}}\n  onGithub={() => {}}" : "";

    return `<AuthenticationForm
  heading=${JSON.stringify(props.heading)}
  initialMode=${JSON.stringify(props.initialMode)}
  onSubmit={(values, mode) => console.log(mode, values)}${socialProps}
/>`;
  },
  stage: {
    desktopWidth: "min(26rem, 100%)",
    mobileWidth: "min(20rem, 100%)",
    minHeight: "32rem",
  },
};

export default adapter;
