/**
 * Adapted from Mantine UI's FloatingLabelInput and InputValidation at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import {
  type Factory,
  factory,
  type StylesApiProps,
  TextInput,
  type TextInputProps,
  useProps,
  useStyles,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { type ChangeEventHandler, type ReactNode, useState } from "react";

import classes from "./floating-label-input.module.css";

export type FloatingLabelInputStylesNames = "root" | "label" | "required" | "input" | "error";

export interface FloatingLabelInputProps
  extends Omit<
      TextInputProps,
      | "classNames"
      | "styles"
      | "unstyled"
      | "vars"
      | "attributes"
      | "variant"
      | "value"
      | "defaultValue"
      | "onChange"
    >,
    StylesApiProps<FloatingLabelInputFactory> {
  /**
   * Controlled value. When provided, this component is fully controlled and
   * `onChange` is the only way its displayed value changes. When omitted,
   * the component tracks its own internal state (seeded from
   * `defaultValue`) so it also works as a drop-in uncontrolled input.
   */
  value?: string;
  /** Initial value for uncontrolled usage. Ignored once `value` is provided. */
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /**
   * Icon rendered in the right section while `error` is set. Pass `null` to
   * keep the invalid styling without an icon.
   * @default <IconAlertTriangle />
   */
  errorIcon?: ReactNode | null;
}

export type FloatingLabelInputFactory = Factory<{
  props: FloatingLabelInputProps;
  ref: HTMLInputElement;
  stylesNames: FloatingLabelInputStylesNames;
}>;

const DEFAULT_ERROR_ICON = <IconAlertTriangle stroke={1.5} size={18} aria-hidden="true" />;

export const FloatingLabelInput = factory<FloatingLabelInputFactory>((_props) => {
  const props = useProps("FloatingLabelInput", null, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    attributes,
    ref,
    label = "Floating label",
    placeholder = "OMG, it also has a placeholder",
    required = true,
    autoComplete = "nope",
    value,
    defaultValue,
    onChange,
    onFocus,
    onBlur,
    error,
    errorIcon = DEFAULT_ERROR_ICON,
    rightSection,
    labelProps,
    ...others
  } = props;

  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const [focused, setFocused] = useState(false);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : uncontrolledValue;
  const floating = currentValue.trim().length !== 0 || focused || undefined;

  const getStyles = useStyles<FloatingLabelInputFactory>({
    name: "FloatingLabelInput",
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

  const errorIconSection =
    error && errorIcon !== null ? (
      <span className={classes.errorIcon}>{errorIcon}</span>
    ) : undefined;

  return (
    <TextInput
      ref={ref}
      unstyled={unstyled}
      label={label}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      value={currentValue}
      error={error}
      rightSection={errorIconSection ?? rightSection}
      onChange={(event) => {
        if (!isControlled) setUncontrolledValue(event.currentTarget.value);
        onChange?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      data-floating={floating}
      labelProps={{ ...labelProps, "data-floating": floating }}
      classNames={{
        root: getStyles("root").className,
        label: getStyles("label").className,
        required: getStyles("required").className,
        input: getStyles("input").className,
        error: getStyles("error").className,
      }}
      styles={{
        root: getStyles("root").style,
        label: getStyles("label").style,
        required: getStyles("required").style,
        input: getStyles("input").style,
        error: getStyles("error").style,
      }}
      {...others}
    />
  );
});

FloatingLabelInput.classes = classes;
FloatingLabelInput.displayName = "FloatingLabelInput";

export namespace FloatingLabelInput {
  export type Props = FloatingLabelInputProps;
  export type StylesNames = FloatingLabelInputStylesNames;
  export type Factory = FloatingLabelInputFactory;
}
