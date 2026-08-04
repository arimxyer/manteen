/**
 * Adapted from Mantine UI's PasswordStrength at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 *
 * Controlled/uncontrolled contract (settled across floating-label-input,
 * password-strength, autocomplete-loading — the tranche's three form
 * controls): whether the public `value`/`onChange` pair is event-based or
 * value-based is decided by the props surface, not by preference.
 *   - Drop-in wrappers — `Props extends Omit<XProps, ...>` with X's own ref
 *     type, rendering nothing but `<X {...} />` — keep X's exact contract,
 *     because a consumer swapping `<X>` for the wrapper shouldn't have to
 *     rewrite their handler. TextInput/PasswordInput/Textarea are
 *     event-based (`ChangeEventHandler<HTMLInputElement>`);
 *     Autocomplete/Select and the rest of the combobox family are
 *     value-based (`(value: string) => void`).
 *   - Composite components that own their own props surface (their own
 *     BoxProps/ElementProps, their own ref) aren't a drop-in for any single
 *     base, so they expose the simple value-based contract instead.
 * Both controlled and uncontrolled work everywhere. Event-based drop-ins
 * hand-roll `useState` + `isControlled = value !== undefined`, because
 * `useUncontrolled`'s onChange payload type is tied to the tracked value
 * type and can't emit a raw DOM event. Everything else uses
 * `@mantine/hooks`' `useUncontrolled`.
 *
 * This component is a composite, not a drop-in for PasswordInput: its props
 * extend `BoxProps` + `ElementProps<"div", "onChange">` (its own surface,
 * not `Omit<PasswordInputProps, ...>`) and its ref is `HTMLDivElement`, not
 * `HTMLInputElement` — a consumer swapping `<PasswordInput>` for this
 * component already loses `error`, size/description forwarding to the
 * input, and the input ref, so there's no drop-in property left to preserve
 * by matching PasswordInput's event-based onChange. Value-based onChange,
 * `@mantine/hooks`' `useUncontrolled`.
 */

import {
  Box,
  type BoxProps,
  Center,
  type ElementProps,
  type Factory,
  factory,
  type GetStylesApi,
  Group,
  PasswordInput,
  Progress,
  type StylesApiProps,
  Text,
  useProps,
  useStyles,
} from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import { IconCheck, IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";

import classes from "./password-strength.module.css";

export interface PasswordStrengthRequirement {
  /** Tested against the current value; a match counts the requirement as met. */
  re: RegExp;
  /** Requirement text shown in the checklist. */
  label: string;
}

/** Upstream's requirement list, exported so consumers can extend rather than replace it. */
export const defaultPasswordStrengthRequirements: PasswordStrengthRequirement[] = [
  { re: /[0-9]/, label: "Includes number" },
  { re: /[a-z]/, label: "Includes lowercase letter" },
  { re: /[A-Z]/, label: "Includes uppercase letter" },
  { re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: "Includes special symbol" },
];

function getPasswordStrength(
  password: string,
  requirements: readonly PasswordStrengthRequirement[],
  minLength: number,
) {
  let multiplier = password.length >= minLength ? 0 : 1;

  for (const requirement of requirements) {
    if (!requirement.re.test(password)) {
      multiplier += 1;
    }
  }

  return Math.max(100 - (100 / (requirements.length + 1)) * multiplier, 0);
}

export type PasswordStrengthStylesNames =
  | "root"
  | "input"
  | "meter"
  | "bar"
  | "requirement"
  | "requirementLabel";

export interface PasswordStrengthProps
  extends BoxProps,
    StylesApiProps<PasswordStrengthFactory>,
    ElementProps<"div", "onChange"> {
  /** Controlled value. Omit to let the component manage its own state. */
  value?: string;
  /** Initial value when uncontrolled. @default '' */
  defaultValue?: string;
  /** Called with the next value on every keystroke, controlled or not. */
  onChange?: (value: string) => void;
  /** @default 'Password' */
  label?: ReactNode;
  /** @default 'Your password' */
  placeholder?: string;
  /** @default true */
  required?: boolean;
  /** Minimum character count the length requirement checks for. @default 6 */
  minLength?: number;
  /** Regex + label pairs checked against the value. @default defaultPasswordStrengthRequirements */
  requirements?: readonly PasswordStrengthRequirement[];
}

export type PasswordStrengthFactory = Factory<{
  props: PasswordStrengthProps;
  ref: HTMLDivElement;
  stylesNames: PasswordStrengthStylesNames;
}>;

interface RequirementRowProps {
  meets: boolean;
  label: ReactNode;
  unstyled: boolean | undefined;
  getStyles: GetStylesApi<PasswordStrengthFactory>;
}

function RequirementRow({ meets, label, unstyled, getStyles }: RequirementRowProps) {
  return (
    <Text
      component="div"
      unstyled={unstyled}
      c={meets ? "teal" : "red"}
      size="sm"
      {...getStyles("requirement")}
    >
      <Center inline unstyled={unstyled}>
        {meets ? (
          <IconCheck size={14} stroke={1.5} aria-hidden="true" />
        ) : (
          <IconX size={14} stroke={1.5} aria-hidden="true" />
        )}
        <Box component="span" {...getStyles("requirementLabel")}>
          {label}
        </Box>
      </Center>
    </Text>
  );
}

export const PasswordStrength = factory<PasswordStrengthFactory>((_props) => {
  const props = useProps("PasswordStrength", null, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    attributes,
    ref,
    value,
    defaultValue,
    onChange,
    label = "Password",
    placeholder = "Your password",
    required = true,
    minLength = 6,
    requirements = defaultPasswordStrengthRequirements,
    ...others
  } = props;

  const [passwordValue, handleChange] = useUncontrolled({
    value,
    defaultValue,
    finalValue: "",
    onChange,
  });

  const getStyles = useStyles<PasswordStrengthFactory>({
    name: "PasswordStrength",
    classes,
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
  });

  const strength = getPasswordStrength(passwordValue, requirements, minLength);
  const barColor = strength > 80 ? "teal" : strength > 50 ? "yellow" : "red";
  const strengthLabel = strength > 80 ? "Strong" : strength > 50 ? "Fair" : "Weak";
  const meetsMinLength = passwordValue.length >= minLength;
  const minLengthLabel = `Has at least ${minLength} character${minLength === 1 ? "" : "s"}`;

  const bars = [1, 2, 3, 4].map((segment) => (
    <Progress
      key={`segment-${segment}`}
      unstyled={unstyled}
      value={
        passwordValue.length > 0 && segment === 1 ? 100 : strength >= (segment / 4) * 100 ? 100 : 0
      }
      color={barColor}
      size={4}
      transitionDuration={0}
      aria-label={`Password strength segment ${segment} of 4`}
      {...getStyles("bar")}
    />
  ));

  const checks = requirements.map((requirement) => (
    <RequirementRow
      key={requirement.label}
      label={requirement.label}
      meets={requirement.re.test(passwordValue)}
      unstyled={unstyled}
      getStyles={getStyles}
    />
  ));

  return (
    <Box ref={ref} {...getStyles("root")} {...others}>
      <PasswordInput
        unstyled={unstyled}
        value={passwordValue}
        onChange={(event) => handleChange(event.currentTarget.value)}
        label={label}
        placeholder={placeholder}
        required={required}
        {...getStyles("input")}
      />

      <Group gap={5} grow role="group" aria-label="Password strength" {...getStyles("meter")}>
        {bars}
      </Group>
      <span className={classes.visuallyHidden} aria-live="polite">
        Password strength: {strengthLabel}
      </span>

      <div aria-live="polite">
        <RequirementRow
          label={minLengthLabel}
          meets={meetsMinLength}
          unstyled={unstyled}
          getStyles={getStyles}
        />
        {checks}
      </div>
    </Box>
  );
});

PasswordStrength.classes = classes;
PasswordStrength.displayName = "PasswordStrength";

export namespace PasswordStrength {
  export type Props = PasswordStrengthProps;
  export type StylesNames = PasswordStrengthStylesNames;
  export type Factory = PasswordStrengthFactory;
  export type Requirement = PasswordStrengthRequirement;
}
