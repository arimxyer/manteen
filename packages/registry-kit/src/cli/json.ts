export interface KitCommandError {
  code: string;
  message: string;
  details?: unknown;
}

export interface KitCommandEnvelope<T = unknown> {
  schemaVersion: 1;
  command: string;
  ok: boolean;
  exitCode: number;
  mutated: boolean;
  payload: T | null;
  errors: KitCommandError[];
  notes: string[];
}

export function kitEnvelope<T>(
  command: string,
  exitCode: number,
  mutated: boolean,
  payload: T | null,
  errors: KitCommandError[] = [],
  notes: string[] = [],
): KitCommandEnvelope<T> {
  return {
    schemaVersion: 1,
    command,
    ok: exitCode === 0,
    exitCode,
    mutated,
    payload,
    errors,
    notes,
  };
}

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
