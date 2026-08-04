/**
 * Adapted from Mantine UI's AutocompleteLoading at
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
 * This component is a drop-in for Autocomplete (it renders nothing but
 * `<Autocomplete {...} />`, and its props extend
 * `Omit<AutocompleteProps, ...>`): value-based onChange, matching
 * Autocomplete's own. Controlled/uncontrolled state is hand-rolled here
 * rather than routed through `useUncontrolled`, so this item's `npm` list
 * doesn't gain a `@mantine/hooks` dependency the registry entry doesn't
 * already declare.
 */

import { Autocomplete, type AutocompleteProps, Loader } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

const DEFAULT_EMAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.com"];

/**
 * Demo-only source used when the consumer doesn't supply `loadOptions`: it
 * fakes a short round trip and suggests the query at three common email
 * domains, so the component is useful to look at with zero configuration.
 * Replace it with a real request in production.
 */
async function defaultLoadOptions(query: string): Promise<string[]> {
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  return DEFAULT_EMAIL_DOMAINS.map((domain) => `${query}@${domain}`);
}

function defaultShouldQuery(query: string): boolean {
  return query.trim().length > 0;
}

export interface AutocompleteLoadingProps
  extends Omit<AutocompleteProps, "data" | "value" | "defaultValue" | "onChange" | "rightSection"> {
  /**
   * Controlled value. When provided, this component is fully controlled and
   * `onChange` is the only way its displayed value changes. Composes with
   * the async `loadOptions` flow: an external write to `value` cancels any
   * pending debounce/request for whatever was last typed rather than
   * letting a stale response land against the new value (see the
   * cancel-only effect below). Ordinary controlled-input semantics apply:
   * if the consumer doesn't write the typed value back through `onChange`,
   * the displayed text snaps back to `value` even though the query for
   * what was typed still ran to completion — that's expected, not a bug in
   * this component.
   */
  value?: string;
  /** Initial value for uncontrolled usage. Ignored once `value` is provided. @default '' */
  defaultValue?: string;
  /** Called on every keystroke with the raw input value, not debounced. */
  onChange?: (value: string) => void;
  /** Delay, in milliseconds, after typing stops before `loadOptions` runs. @default 1000 */
  debounceMs?: number;
  /**
   * Fetches suggestions for the current query. Receives the raw input value
   * and resolves to the options to display. Defaults to a demo implementation
   * that suggests the query at common email domains; pass your own to query a
   * real source.
   */
  loadOptions?: (query: string) => Promise<string[]>;
  /**
   * Decides whether `loadOptions` should run for a given query, e.g. to skip
   * an empty value or one that's already a complete answer. Returning `false`
   * clears any pending request and turns the loader off.
   * @default (query) => query.trim().length > 0
   */
  shouldQuery?: (query: string) => boolean;
}

// `loadOptions` results are already the server's answer, so the dropdown
// shouldn't re-filter them against the query with Mantine's default
// substring match — a real search (typo-tolerant, ranked, whatever) can
// legitimately return options that don't literally contain the query text.
function passthroughFilter<T>({ options }: { options: T }): T {
  return options;
}

export function AutocompleteLoading({
  value,
  defaultValue = "",
  onChange,
  debounceMs = 1000,
  loadOptions = defaultLoadOptions,
  shouldQuery = defaultShouldQuery,
  filter = passthroughFilter,
  label = "Async Autocomplete data",
  placeholder = "Your email",
  ...others
}: AutocompleteLoadingProps) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const currentValue = isControlled ? value : uncontrolledValue;

  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<string[]>([]);

  const timeoutRef = useRef<number | undefined>(undefined);
  // Bumped on every query attempt (including skipped ones) so a response from
  // an earlier, slower request can never overwrite a later one.
  const requestIdRef = useRef(0);
  // The value the *handler* last saw, kept separate from `currentValue` so
  // the cancel-only effect below can tell "the parent just wrote a new
  // controlled value out-of-band" apart from "the handler already dealt
  // with this value" (which would otherwise re-fire on every render).
  const lastHandledValueRef = useRef(currentValue);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  // Query initiation happens ONLY in handleChange, below — this effect
  // never starts a query, it only cancels one. That single-initiation-point
  // invariant is what keeps requestIdRef a reliable "latest wins" guard; if
  // both this effect and handleChange could bump it to *start* a request,
  // controlled usage could race two in-flight queries against each other.
  //
  // Why this effect exists at all: in controlled mode the input's value can
  // change without handleChange ever running (a parent clears it after a
  // selection, a reset button, etc). Without this, a debounce armed for the
  // old text would still fire ~debounceMs later and populate options for
  // text that's no longer in the field.
  useEffect(() => {
    if (!isControlled) return;
    if (value === lastHandledValueRef.current) return;

    window.clearTimeout(timeoutRef.current);
    requestIdRef.current += 1; // invalidate any in-flight response
    setLoading(false);
    setOptions([]);
    lastHandledValueRef.current = value;
    // Deliberately NOT depending on `lastHandledValueRef` (a ref, stable
    // identity, reading it here doesn't need a dep) or on the cancellation
    // side-effects themselves — this effect's only job is "did the
    // controlled `value` change out from under the handler," so it depends
    // on exactly `isControlled` and `value`.
  }, [isControlled, value]);

  const handleChange = (nextValue: string) => {
    window.clearTimeout(timeoutRef.current);
    if (!isControlled) setUncontrolledValue(nextValue);
    lastHandledValueRef.current = nextValue;
    setOptions([]);
    onChange?.(nextValue);

    const requestId = ++requestIdRef.current;

    if (!shouldQuery(nextValue)) {
      setLoading(false);
      return;
    }

    setLoading(true);

    timeoutRef.current = window.setTimeout(() => {
      loadOptions(nextValue)
        .then((results) => {
          if (requestIdRef.current !== requestId) return; // a newer query already won
          setLoading(false);
          setOptions(results);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setLoading(false);
          setOptions([]);
        });
    }, debounceMs);
  };

  return (
    <Autocomplete
      value={currentValue}
      data={options}
      onChange={handleChange}
      filter={filter}
      rightSection={loading ? <Loader size={16} aria-label="Loading suggestions" /> : null}
      label={label}
      placeholder={placeholder}
      {...others}
    />
  );
}
