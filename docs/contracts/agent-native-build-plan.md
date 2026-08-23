# Agent-native build plan

[Documentation map](../project-context.md) · [Contracts](README.md)

Status: frozen implementation contract for the 0.2.1 kit and 0.6/0.7 client milestones.

This document turns the agent-native roadmap into executable contracts. Existing decisions in
`client-build-plan.md` remain authoritative unless this document explicitly extends them.

## 1. Machine interface

Every recognized `--json` invocation writes exactly one JSON document to stdout and never prompts.
JSON mode is non-interactive, but it is not consent: a command that needs a destructive or ambiguous
choice still refuses unless the matching explicit flag was supplied.

That stdout reservation includes subprocesses. Package-manager and verification output must be
captured or sent to stderr; a child process may never inherit machine stdout. Captured dependency
output is discarded on success and retained in the structured failure on error so the envelope stays
parseable without erasing the evidence needed to diagnose an install.

The client envelope is schema version 1:

```ts
interface CommandEnvelope<T = unknown> {
  schemaVersion: 1;
  command: string;
  root: string | null;
  ok: boolean;                 // exactly exitCode === 0
  exitCode: number;
  mutated: boolean;            // any durable project byte changed during this invocation
  payload: T | null;
  diagnostics: Diagnostic[];
  errors: CommandError[];
  notes: string[];
}
```

Diagnostics and errors use stable codes. A blocking diagnostic either contains at least one typed
remediation action or records a human-readable `manualRationale`. Actions are one of:

- `rerun`: an argv array, never a shell string;
- `configPatch`: a JSON-compatible patch for `manteen.json`;
- `manual`: a bounded instruction that cannot safely be automated.

Schemas are published with both packages and validate success and refusal documents. Secrets and
expanded URL variables are excluded from all envelopes, diagnostics, receipts, and digests.

## 2. Registry output ownership

`manteen-kit build` first renders and validates every output byte in a sibling staging directory.
It never incrementally mutates the destination.

The destination is refused when it is a filesystem root, the user's home, the current directory,
the catalog directory or one of its ancestors, a symlink/junction, or a non-directory. Each existing
path component relevant to replacement is inspected without following links.

Generated output contains `.manteen-kit-output.json` with schema version, namespace, package version,
and sorted relative filename/SHA-256 entries. It contains no timestamp or absolute path.

An unmarked directory may be adopted only when it contains exactly a valid registry index and the
matching valid item documents, with no unknown entries, subdirectories, or links. A marked directory
may be replaced only when the marker validates and every owned file still matches its recorded hash.
`--overwrite-output` permits replacement of drifted owned generated files only; it never permits
unknown entries, invalid ownership, or an unsafe destination.

Replacement is journaled before renames. Recovery either deterministically completes/rolls back the
known transaction or refuses without deleting evidence. The exported planner is read-only; the
writer returns a structured outcome. `writeRegistry(result, outDir)` remains supported with safe
defaults.

`build --check` renders and validates, compares the complete prospective output with disk, and never
mutates. Its JSON result distinguishes `clean`, `missing`, `changed`, and `refused`.

## 3. Client planning and execution

Mutating previews include `planDigest`. `--expect-plan <sha256>` is accepted by `init`, `add`,
`update`, and `remove`; a mismatch is a non-forceable zero-write refusal.

The canonical digest is SHA-256 over stable JSON containing normalized options, normalized root,
requested refs, redacted sources, source hashes, destinations, dispositions, dependency operations,
theme/styles operations, verification definitions, and preimage hashes. It excludes source bodies,
expanded variables, timestamps, and incidental display text.

Optional verification commands are configured separately for add, update, and remove. Each command
can opt out with `--no-verify`. Verification runs after writes and inside rollback: failure restores
all captured preimages, while `mutated` truthfully records whether durable bytes remain changed when
the process exits. Verification definitions are included in the plan digest and drift is refused.

`status` is offline. Missing or invalid initialization is a successful assessment with
`healthy: false`; only inability to inspect the target is a command failure. It reports configuration,
framework, package manager, Mantine, receipt/base integrity, `.gitignore`, verification, and packaged
skill installation without fetching a registry.

`init` may complete only enumerated, absent standard fields in an existing configuration. A missing
canonical `@house` member and missing detected `theme` path are additive migrations; custom registry
members and every unrelated key remain byte-semantically preserved. Missing fields that select source
ownership, and every explicit differing value, still refuse with a truthful missing/conflicting/invalid
reason. When one exact JSON edit is safe to propose but not safe to assume, machine output carries a
`configPatch` action.

A successful `add` proves registry installation, not application integration. Text mode emits that
fact as an informational stderr advisory and machine mode carries the same text in `notes`; previews,
refusals, cancellations, and failed or rolled-back applies do not claim installation. Guidance tells
agents to inspect item usage and edit consumer-owned application code only when the request asks to
use the item. Manteen never guesses a route or automatically inserts a component into one.

## 4. Metadata, discovery, and SDK

Registry items retain `docs`, `props`, and `usage`. Malformed optional display metadata degrades the
metadata section without making otherwise installable item bytes unusable. `info --json` returns the
full fields by default; text is compact, with `--props` and `--usage` for expansion.

`list` supports deterministic `--query`, repeatable `--type`, and `--installed` filters. With no
query, registry and canonical item order remain unchanged. A query ranks matching rows within each
registry by exact canonical id, exact name, exact title, title prefix, id/name substring, title
substring, then description substring; ties retain the prior item order. JSON exposes both every
matching field and the winning rank so the ordering is explainable rather than an opaque score.

The supported programmatic entrypoint is `createManteenClient()`: read operations plus opaque
plan/apply handles. Existing low-level exports remain available but are not the stable façade.

## 5. Packaged agent guidance

The CLI package owns `skill/manteen/`: `SKILL.md`, `agents/openai.yaml`, and one-level references for
consumer use, authoring, and the JSON contract. A versioned agent manifest is the common source for
CLI guide output and documentation command/version data.

`manteen agent guide [--json]` works without project configuration. `manteen agent install` defaults
to `.agents/skills/manteen` and offers explicit universal-user, Codex-user, Claude-project,
Claude-user, and custom targets. `--dry-run --json --update` are supported. Existing unowned or
modified installations are refused; `--take-packaged` is the explicit destructive replacement flag.
`init` never edits `AGENTS.md` or installs the skill implicitly.

The repository root contains vendor-neutral `AGENTS.md`. The public docs expose an Agent Guide plus
`/llms.txt` and `/llms-full.txt`. MCP is deliberately outside this roadmap.

## 6. Release boundary

Implementation, tests, packed-artifact probes, changelogs, and release handoffs are in scope. Signed
tags, npm publication, and deployment are separate explicit approvals.
