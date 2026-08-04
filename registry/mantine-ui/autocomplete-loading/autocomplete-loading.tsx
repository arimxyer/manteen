/**
 * Adapted from Mantine UI's AutocompleteLoading at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
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
  /** Initial input value. @default '' */
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
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<string[]>([]);

  const timeoutRef = useRef<number | undefined>(undefined);
  // Bumped on every query attempt (including skipped ones) so a response from
  // an earlier, slower request can never overwrite a later one.
  const requestIdRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const handleChange = (nextValue: string) => {
    window.clearTimeout(timeoutRef.current);
    setValue(nextValue);
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
      value={value}
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
