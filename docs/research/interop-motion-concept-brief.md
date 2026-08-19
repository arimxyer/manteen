# Interop motion concept brief

[Documentation map](../project-context.md) · [Research](README.md)

Status: point-in-time concept research from 2026-08-19, produced for the replacement site's
interoperability band. It is a design brief for separate prototype owners, not a product contract,
and not deployment evidence. `apps/manteen` remains an undeployed candidate. A later selection is
recorded under [Selection](#selection); it does not change the evidence boundary of this brief.

Every product claim below is cited to an executable source in this checkout. Where two documents
disagreed, the disagreement was surfaced rather than smoothed over; the one instance found has since
been resolved by its owner — see [Resolved evidence finding](#10-resolved-evidence-finding).

## 1. What this brief is for

At the time of this brief, the interoperability band paired a copy card with `InteropStages`, an
illustration that toggled one registry item between three representations. That illustration
answered one question well. This brief asks whether the band's central claim — *compile once, stay
interoperable* — has a better explanatory model available, and it prepares that question for
independent prototype owners in the shape the
[authoring-descriptor motion retrospective](authoring-descriptor-motion-retrospective.md)
established: distinct explanatory models first, motion thesis before choreography, explicit
scoring, a rejection log, and fresh isolated ownership after shortlisting.

The brief does not choose. It supplies four candidates that clear a stated threshold, four that do
not and the reason, a rejection log so a handsome metaphor cannot return under a new visual
treatment, and the verification each owner owes.

## 2. Product truth, from the owning sources

This section is the instructional contract. A candidate that contradicts anything here is wrong
regardless of how it looks.

### 2.1 Mantine-native intent remains the source of truth

An author writes `manteen.registry.json` in Mantine's vocabulary and never writes the interchange
vocabulary. `kind`, `mantine`, `provider`, `npm`, `npmDev`, `uses`, `css`, `files[].as`,
`themeFragment`, `stylesApi`, `props`, `usage` and `docs` are the authoring surface
(`packages/registry-kit/src/build-registry.ts`, `MantineItem`).

The containment is mechanical, not conventional. `schema/manteen.registry.schema.json` declares
`additionalProperties: false` at the catalog root, at the item level and at the file level, so an
unknown field is **rejected rather than dropped** — the authoring format cannot quietly drift toward
the wire format. The wire vocabulary appears in exactly two places in the kit, the `ITEM_TYPE` and
`FILE_TYPE` maps, and the module comment says so.

The consequence for an illustration: the author's document is not an early draft of the compiled
one. It is a different language that a fixed translation reads, in one direction.

### 2.2 Compilation produces a fully validated static index and item documents

`compileRegistry(catalogPath)` validates the catalog against the authoring schema and throws when
it fails. It then compiles each item and validates every emitted item against the vendored
interchange schema, collecting failures rather than throwing per item.

`renderOutput` in `packages/registry-kit/src/registry-output.ts` is where the set becomes a
publication, and it refuses on any of:

- one or more items failed wire-schema validation (`wire-schema-failures`);
- an item name that is not `^[a-z0-9][a-z0-9-]*$`, or an item that fails revalidation at render
  time (`invalid-rendered-item`) — every item is checked a second time here, after compile;
- two rendered items claiming one filename (`duplicate-rendered-item`);
- an index that is not exactly the rendered set, by name and by type (`invalid-registry-index`).

What is emitted is static: `registry.json`, one `<name>.json` per item, and
`.manteen-kit-output.json` carrying schema version, namespace, package version and sorted
path/SHA-256 entries with no timestamp and no absolute path.

### 2.3 A generic client understands the shared interchange core

Each item document carries `$schema`, `name`, `type` (`registry:ui|block|hook|lib|file`), and
optionally `title`, `description`, `dependencies`, `devDependencies`, `docs`, `css` (compiled
through a deliberately narrow import-only subset, D26) and `registryDependencies` with bare names
qualified to the authoring registry's namespace. `files[]` carries `path`, `type`, an optional
`target`, and the file's `content` inlined.

That set is sufficient to install. A client that has never heard of Mantine reads it, writes the
files, and installs the dependencies.

### 2.4 Manteen additionally understands preserved `meta.mantine`

Everything Mantine-shaped that the wire format has no field for compiles into one open object:
`meta.mantine.requires` (the version gate), `provider`, `stylesApi`, `props`, and `usage` and
`themeFragment` as `{path, content}` pairs with the file contents inlined.

The registry index carries a strictly smaller record. `buildIndex` emits `name`, `type`, optional
`title` and `description`, and only the discovery-safe `requires` and `provider` summary. The
`stylesApi` declaration, the inlined theme fragment, the inlined usage example, `props` and the
file contents are item-detail metadata and appear only in the item document.

### 2.5 Interoperability is progressive enrichment, not lowest-common-denominator authoring

The authoring layer is not reduced to what the wire format can express. The enrichment rides along
in a field the interchange schema deliberately leaves open, and the two ends handle it
asymmetrically on purpose.

The interchange schema declares `meta` as `{"type": "object", "additionalProperties": true}` with no
further structure. A generic client therefore has genuinely nothing to read there — not a hidden
payload, an unschema'd one. `meta.mantine.requires = 12345` passes the kit's wire validator
untouched, which is exactly why the client ships its own `mantine-item-meta.schema.json` and
validates a second time.

`packages/cli/src/plan/validate-item.ts` states the split, and it is the sharpest single expression
of what "progressive" means here:

| Field | Direction on malformation | Result |
| --- | --- | --- |
| `requires` | fails **closed** | blocking `meta-invalid-requires`, error, non-forceable |
| `provider`, `stylesApi`, `themeFragment` | fails **open** | `meta-degraded` warning, field dropped, item still installs |
| `docs`, `props`, `usage` | fails **open** | `meta-degraded` warning, field dropped, item still installs |
| unknown keys | ignored | a newer kit does not break an older client |

Enrichment can be dropped safely precisely because the one part that protects the consumer cannot
be. That asymmetry is a decision, not a parser's best effort.

### 2.6 Validation refuses partial publication

`writeRegistry` never incrementally mutates the destination. It renders every byte into a sibling
staging directory, writes a journal, moves an existing target aside, installs the staged directory
by rename, then removes the backup and the journal. Recovery either deterministically completes or
rolls back the known transaction, or refuses without deleting evidence.

Destinations are refused before anything is staged: the filesystem root, the user's home, the
current working directory, the catalog directory or any of its ancestors, a path reached through a
symlink or junction, or an existing non-directory. Marker-owned files that have drifted refuse
unless `--overwrite-output` is passed, and that flag never permits replacing unknown entries. An
unmarked directory is adopted only when it is *exactly* a valid registry index plus the matching
valid item documents, with no unknown entries. `build --check` renders, validates, compares the
complete prospective output with disk, never mutates, and distinguishes `clean`, `missing`,
`changed` and `refused`.

There is no state in which half a registry is published because one item was bad.

## 3. Five stages that must not blur

A candidate that collapses any two of these is inaccurate even if it is beautiful. The current
`InteropStages` labels three of them; a replacement must be at least as careful.

| Stage | What happens | Where the truth lives |
| --- | --- | --- |
| **Compilation** | Local. Catalog validated, items compiled and validated twice, index checked against the rendered set, complete output staged and installed or refused. No network. | `build-registry.ts`, `registry-output.ts` |
| **Publication** | Those static files become URLs. A local build is not a public artifact; Pages deployment is manual-dispatch and separately approved. | `project-context.md`, `.github/workflows/pages.yml` |
| **Discovery** | Reading the index — browsing, `list`, and did-you-mean on a 404. The index URL is configured separately and is **never fetched by `add`**. | `plan/registry-source.ts` (D21), `agent-native-build-plan.md` §4 |
| **Installation** | A reference becomes a canonical id, a `{name}` URL template is expanded (with `${VAR}` kept literal in everything durable), one item document is fetched and revalidated, a graph is resolved across registries, gates run, and bytes are written. Dedupe is by canonical id, never by destination (D8). | `plan/ref.ts`, `plan/registry-source.ts`, `plan/validate-item.ts` |
| **Manteen-aware behavior** | What differs *given the same bytes*: the compatibility gate, the provider warning, the theme fragment merge, the Styles API report, and `props`/`usage` in `info`. | `plan/validate-item.ts`, `gates/`, refusal table in `client-build-plan.md` |

Two of these are routinely conflated in the wild and a good candidate can correct one of them:
discovery is assumed to precede every install (it does not), and "it compiled" is assumed to mean
"it is published" (it does not). The production control conflates a third pair — its measured
behavior is recorded in §4 — by carrying one toggle from the authored catalog through to the
consumer's project, which spans publication, discovery and installation in a single step.

## 4. What the illustration must not repeat

### Measured baseline: what the production control already does

Recorded by the coordinating agent against the checked-in `InteropStages`, 2026-08-19. These are
measurements of the current control, not instructions to favour any metaphor. A candidate is worth
building only if it keeps the strengths and closes at least one of the gaps.

**Strengths to keep.**

- Responsive and accessible as built. At 390px the three stage controls fit on one row and the row
  list has no overflow.
- Reduced motion suppresses layout transforms. Note the mechanism: `MotionConfig
  reducedMotion="user"` deliberately leaves opacity alone, so a brief opacity transition remains.
  An owner who reuses that mechanism inherits the same behavior. Where a concept in §6 specifies a
  still with no crossfade, the owner must suppress opacity explicitly rather than assume
  `reducedMotion="user"` covers it.
- Every key it shows is real, and the compiled stage was transcribed from actual kit output rather
  than written by hand.

**Measured gaps a candidate may close.**

- It shows one stage at a time, so no two representations are ever on screen together.
- It asks the reader to decode reordered rows: each stage keeps its own document's key order, and
  the same fact appears at a different height in each.
- Rows visibly cross during the author-to-compiled layout spring, and for a few frames render over
  each other. The source records this as a knowing trade — the alternative holds one order
  everywhere and the rows barely move — so it is a documented cost, not an unnoticed defect.
- It conflates compilation with later installation: its third stage is the consumer's project, so
  one control spans a boundary that §3 separates into publication, discovery and installation.
- It never shows a generic reader and a Manteen-aware reader coexisting, which is the band's actual
  claim.

The last two gaps are the substantive ones. A candidate that closes neither is not worth promoting
over a control that is already responsive, accessible and truthful.

### Neighbouring illustrations and the question each already answers

| Name | Question it owns |
| --- | --- |
| **Dial** (`prototypes/authoring-descriptor/volvelle.tsx`) | Who owns what — the author declares Mantine-native intent, `manteen-kit` owns transport. |
| **Cast** (`projection.tsx`) | One authored filename reaches two consumer roots without either replacing the other. |
| **Phase** (`phase-lock.tsx`) | What the client does with each reading of an installed version — five readings, one refusal. |
| **Gauge** (`operating-envelope.tsx`) | Where a project sits relative to the declared version band. |
| **InteropStages** (production) | What one item's field set looks like at each of three stages. |

A new concept must answer a question absent from that list. If it answers one of these in a new
visual style, it is redundant — the retrospective records exactly this failure, where the first
Phase direction restated Gauge.

### Devices ruled out for this band

- **Boxes joined by arrows.** The current `Interop` card comment records why: three labelled boxes
  named the stages of the pipeline without ever showing one, so the card asserted its claim in the
  same voice as the copy beside it.
- **Decorative code highlighting.** Tinting the fields a generic client understands makes the
  enrichment look like a colour rather than a behavior, and it teaches nothing about consequence.
- **Autoplay, play-on-view, or looping.** The homepage contract is that the first render — the one
  that ships in the HTML — plays nothing, and only a state the reader chose animates
  (`AnimatePresence initial={false}`, and the same contract in the install terminal).

## 5. Scoring model and threshold

Six axes, 1–5 each, scored against the sources in §2:

- **Product truth** — every drawn fact is transcribable from an owning source, and nothing implied
  is false.
- **Causal clarity** — the animation reads as one cause and one effect, statable in a sentence.
- **Distinctness** — it answers a question no neighbouring illustration answers.
- **Motion necessity** — a still cannot make the claim; motion is doing work, not decorating.
- **Static truth** — the settled and reduced-motion frames are complete, truthful stills, not the
  animation paused at an arbitrary time.
- **Homepage fit** — it belongs in the interoperability band at homepage density, for the
  homepage's audience.

**Threshold: total ≥ 26 of 30, with no single axis below 4.** Both clauses bind. A candidate that
totals well on the strength of five axes while failing one is not shippable — the retrospective's
evidence is that a concept fails on a single axis (distinctness, static truth) and no amount of
polish elsewhere recovers it.

## 6. Concepts

Eight explanatory models were developed. Exploration stopped when new ideas began duplicating an
existing instructional model rather than at a chosen count; the duplicates are recorded in §9.

Each concept below is written for a fresh owner who has read §2 and §3 and nothing else of this
brief.

---

### 6.1 Reader — one document, two readings

**Motion thesis.** One published item document sits still while the reader changes: under a generic
reading its `meta` collapses to a single unread object, and under Manteen's reading the same region
expands into the behaviors those fields cause. Nothing is added, removed or relabelled — only the
depth at which one artifact is understood.

**Invariant / transform.**

- *Invariant:* the interchange core — `$schema`, `name`, `type`, `dependencies`, `files` — holds
  identical position and identical text in both readings. The `meta.mantine` payload is present in
  both readings; it is never removed.
- *Transform:* the `meta` region only. Generic reading: one row, an opaque object, no structure.
  Manteen reading: the same region expanded into `requires` → checked before any write, `provider`
  → warned when absent, `themeFragment` → merged into a file the project already owns, `stylesApi`
  → reported, `props`/`usage` → shown by `info`.
- *Why it is true:* the interchange schema declares `meta` as `additionalProperties: true` with no
  further structure, so a generic client has nothing to read there. The structure comes from the
  client's own `mantine-item-meta.schema.json`.

**Settled state.** The Manteen reading, fully expanded, with the generic reading's collapsed row
still present as a persistent marker on the meta region — a generic client installs the files and
ignores this. Both facts coexist in the still.

**Reduced motion.** Mount in the Manteen reading, fully expanded, with the generic summary shown as
a static adjacent note rather than as a second state. No collapse, no crossfade. Do not park the
still in the generic reading: that presents the poorer outcome as the default and inverts the
claim.

**Interaction.** A two-position control — *Generic client* / *Manteen*. Default is the settled
Manteen reading. Selection expands or collapses the meta region; the transition is interruptible on
rapid reselection. No autoplay and no play-on-view.

**Risks.**

- Reads as syntax highlighting if the transform is a colour change. The transform must be
  geometric (collapse and expand in place) and semantic (a consequence clause appears), never a
  tint.
- The collapse can imply the generic client *loses* something. The collapsed row must stay at full
  opacity and full legibility; dimming it makes ignoring look like damage.
- Restates `InteropStages` if the two readings change field *names*. They must not. Only depth
  changes; every visible key is byte-identical across readings.
- The expanded state is tall. Reserve height for the tall state so the copy card, a grid sibling,
  cannot jump — the `RESERVE` constant in `interop-stages.tsx` is the precedent and the reason.

**Homepage fit.** High. The band's copy already claims that generic clients install the documents
while Manteen reads the richer metadata on top; this turns that sentence into a demonstration with
one artifact instead of restating it in a second voice.

**Score: 5 / 5 / 4 / 5 / 5 / 5 = 29. Qualifies.** Motion necessity is 5 rather than 4 because the
obvious static form — two columns side by side — asserts two documents, which is the precise
misreading the concept exists to prevent. Distinctness stays at 4 because the concept shares its
subject, one item document, with the production control; the baseline measurement in §4 — that no
neighbouring illustration shows a generic and a Manteen-aware reading coexisting — corroborates the
score rather than raising it. See §8.

---

### 6.2 Swap — the published set is never half-replaced

**Motion thesis.** The published directory is never edited; a complete replacement assembles beside
it and the two exchange places in a single move, or the replacement is discarded and nothing moves
at all. The illustration runs one build that succeeds and one that refuses, and what is already
published is untouched in both.

**Invariant / transform.**

- *Invariant:* the live set — its documents and its ownership marker — holds position and content
  for the entire run until the one exchange frame. The count of documents on the live side never
  drops mid-run.
- *Transform:* the staged side only. It assembles document by document; on a failed item, assembly
  stops and the staged side is removed whole.
- *Why it is true:* `writeRegistry` stages into `.<name>.manteen-kit-stage`, journals, renames.
  `renderOutput` throws *before* any staging on a failed item, an invalid name, a duplicate
  filename, or an index that is not exactly the rendered set. Refusals never mutate.

**Settled state.** The live side holding the new set, the staged side gone, and the refused run's
outcome stated in the same frame: nothing on the live side changed. If only the success is shown,
the claim has not been made.

**Reduced motion.** Two static panels at their end states — *build succeeded: the set was exchanged
in one move* and *build refused: the set was never touched*. No assembly, no journal ticking.

**Interaction.** A two-position control — *Succeeds* / *Refuses* — with replay on reselection. Not
autoplay.

**Risks.**

- Drifts into a pipeline diagram if the staging area is drawn as a *station* upstream. It must be
  drawn as a second copy occupying the same place, which is what it is.
- The three journal phases are genuine but are implementation detail. Drawing them is more
  machinery than the claim needs and invites a boxes-and-arrows reading.
- "Atomic rename" is a filesystem fact this audience does not need in those words. The caption must
  say what it guarantees, not how.
- The refused run can read as the product failing rather than protecting. The copy pairing must
  frame refusal as the guarantee.

**Homepage fit.** Good. The site addresses registry authors as well as consumers, and *your
published registry is never half-updated* is a claim no neighbouring illustration makes. It is
slightly publisher-weighted for the interop band and would sit equally well beside authoring copy;
an owner should prototype it against the interop copy as written.

**Score: 5 / 5 / 5 / 5 / 4 / 4 = 28. Qualifies.**

---

### 6.3 Passenger — content that travels with no destination

**Motion thesis.** Everything in `files` acquires a destination in the consumer's project and lands
there; the theme fragment and the usage example travel inside the same document with no destination
at all. The motion is the moment of arrival, where most of the document disembarks and two payloads
visibly do not.

**Invariant / transform.**

- *Invariant:* the document arrives whole, and both payloads are present in it at every frame,
  before and after. They are never removed and never dimmed out.
- *Transform:* destinations resolve, for `files[]` entries only. The theme fragment is taken up by
  a file the project already owns — a merge, not a write. The usage example is read and written
  nowhere.
- *Why it is true:* `toWireItem` inlines `meta.usage` and `meta.themeFragment` as `{path, content}`
  and the source states the reason — a client that understands the fragment merges it, and one that
  does not must not drop a stray theme module into the project. The README repeats that
  `themeFragment` is deliberately not listed in `files`.

**Settled state.** The project side showing exactly the written files; the project's own theme file
marked as *merged into*, not *written*; the usage payload still in the document, marked read-only.
The unaware-client case must be present in the still: an unaware client writes the same files and
writes nothing else.

**Reduced motion.** Mount fully arrived — destinations already resolved, merge already marked, no
travel.

**Interaction.** None required beyond replay. Optionally a two-position control for *a client that
understands `meta.mantine`* versus *one that does not*, where the second removes the merge mark and
leaves the written-file list identical — that identity is the point.

**Risks.**

- Geometric collision with Cast, which already draws a document reaching project destinations. This
  concept must not draw two projects and must not draw a rail. Its subject is one destination list
  with two exceptions inside it.
- "No destination" can read as "dropped". The payload must stay visible and be labelled by what it
  does instead of where it goes.
- Merging has its own real complexity — insertion order, `.extend()` composition, conflicts,
  callback fields never merged. The illustration must stop at *merged into a file you already own*
  and must not attempt the algorithm.

**Homepage fit.** Good. It is the most concrete instance of enrichment designed so the unaware
reader stays safe, which states the interop claim as a consequence rather than as a capability.

**Score: 5 / 5 / 4 / 4 / 4 / 4 = 26. Qualifies.**

---

### 6.4 Hinge — enrichment fails in two directions, on purpose

**Motion thesis.** The same document arrives with one enrichment field the client cannot read, and
the install completes without it; the one field that cannot be dropped is the compatibility gate,
and an unreadable gate holds the whole install instead. One mechanism, two directions, chosen per
field by what that field protects.

**Invariant / transform.**

- *Invariant:* the files, the dependencies and the destinations are identical in both outcomes,
  because the interchange core was never in question.
- *Transform:* the enrichment region only. An unreadable affordance falls away and the install
  proceeds with a warning; an unreadable gate holds everything and nothing is written.
- *Why it is true:* `validate-item.ts` names the split, and the refusal table in
  `client-build-plan.md` grades it — `meta-invalid-requires` is a non-forceable error,
  `meta-degraded` is a warning at exit code 0.

**Settled state.** Both outcomes present at once: one item installed with a dropped affordance and a
warning, one item refused on an unreadable gate, with the core file list visibly identical in both.

**Reduced motion.** Both outcomes mounted at their end states, no falling away and no holding.

**Interaction.** A two-position control naming the *field*, not the failure — `stylesApi`
unreadable / `requires` unreadable. Replay on reselection.

**Risks.**

- Topical overlap with Phase. Phase's subject is what the client reads off *the project*; this
  concept's subject is what the client reads off *the document*. Both must not draw a verdict
  column, or they will read as one illustration twice.
- Two failures at homepage density read as fragility unless the copy frames the asymmetry as a
  design decision.
- The forward-compatibility clause — unknown keys ignored, so a newer kit does not break an older
  client — is the most valuable fact in this concept and the hardest to draw. It will probably have
  to live in the caption; an owner who can draw it has improved on the brief.

**Homepage fit.** Moderate-good after revision (see §8). It is the clearest available statement that
progressive enrichment is a designed asymmetry rather than best-effort parsing.

**Score: 5 / 5 / 4 / 4 / 4 / 4 = 26. Qualifies.**

---

### 6.5 Recheck — the same contract enforced at both ends

**Motion thesis.** A document validated at emit is validated again on arrival, by an instrument that
did not build it and does not trust it. The motion is the second examination — the same contract
applied at a boundary the first examination could not reach across.

**Invariant / transform.** *Invariant:* the document's bytes, unchanged between the two
examinations. *Transform:* ownership of the check. *Why it is true:* the kit validates each item at
compile and every item again at render; the client revalidates the fetched item with the kit's own
wire validator *plus* its separate `meta.mantine` schema, because the interchange schema's open
`meta` would accept `requires = 12345`.

**Settled state.** Both examinations complete, the bytes identical, and the one class of defect only
the second examination can catch named beside it.

**Reduced motion.** Both examinations mounted complete, no travel between them.

**Interaction.** Replay only.

**Risks.**

- "Validated twice" reads as inefficiency unless the *reason* is on screen: the second examination
  happens across a trust boundary the first could not reach, against a registry the client did not
  build. Without that, a reader sees redundant work.
- The one defect only the second check catches — a structurally valid `meta` whose `requires` is
  nonsense — is specific and abstract at once. Naming it concretely is the difference between a
  claim and an assertion.
- Two examination marks invite a stamped-passport reading, which is both a boxes-and-arrows shape
  and a duplicate of Phase's verdict language.

**Homepage fit.** Low (3). The claim is a topology of trust, and its audience is a reader already
deciding whether to publish a third-party registry — further down the funnel than this band.

**Score: 5 / 4 / 5 / 3 / 4 / 3 = 24. Does not qualify** — motion necessity 3, homepage fit 3. The
claim is a topology of trust, and a still states it about as well as a transition does; the
audience for "who validates twice" is a reader already committed enough to be in the docs.

**Better home.** A concepts page on registry references or the agent-native JSON contract, as a
still.

---

### 6.6 Address — the index is not the shipment

**Motion thesis.** A client asked for one item expands a `{name}` template into one URL and fetches
one document; the index is a separate address it does not touch on the install path. The motion is
a single direct request against a catalogue that stays closed.

**Invariant / transform.** *Invariant:* both addresses, published from the same compilation, both
present throughout. *Transform:* which one is touched, and when — the index lights for browsing and
for did-you-mean on a 404, never for `add`. *Why it is true:* D21 in `plan/registry-source.ts`
records the index as a second URL for did-you-mean and a future `list`/`search`, *never fetched by*
`add`.

**Settled state.** One document fetched, the index untouched and explicitly labelled with the two
jobs it does have.

**Reduced motion.** Mounted at the settled state.

**Interaction.** Replay only, or a two-position control for *installing* versus *browsing*.

**Risks.**

- The claim's whole content is an *absence* — a request that is not made. Drawing absence tempts an
  owner into drawing the index dimmed or crossed out, which reads as broken rather than unused.
- Two labelled addresses joined by a request line is a boxes-and-arrows shape by another name.
- `${VAR}` expansion and its redacted counterpart are adjacent and genuinely interesting, and they
  are a different subject. Pulling them in doubles the concept and blurs it.

**Homepage fit.** Low (3). It corrects a real misconception, but the reader has to already believe
that a registry client fetches something before the correction means anything.

**Score: 5 / 4 / 5 / 2 / 5 / 3 = 24. Does not qualify** — motion necessity 2. This is a true and
genuinely corrective claim about a real misconception, and it is *static*: the assertion is a
topology, and its only temporal content is the absence of a request. Animating a non-event to
justify motion is the failure the retrospective warns about directly.

**Better home.** A still diagram in the registry-references documentation, where the correction
lands on the reader who needs it.

---

### 6.7 Seal — the build knows its own output

**Motion thesis.** The emitted set carries a roster of its own filenames and hashes; a later build
reads the directory back against that roster and refuses on drift rather than overwriting, and
never adopts a file it does not own. The motion is the read-back, not the write.

**Invariant / transform.** *Invariant:* the roster, and the foreign file the build will not touch.
*Transform:* the verdict — `clean`, `missing`, `changed`, `refused`. *Why it is true:*
`.manteen-kit-output.json` carries schema version, namespace, package version and sorted
path/SHA-256 entries with no timestamp; drift refuses unless `--overwrite-output`, which never
permits replacing unknown entries; an unmarked directory is adopted only when it is exactly a valid
registry.

**Settled state.** The roster read back against the directory, one verdict shown, and the foreign
file still present and untouched beside the owned set — the refusal and the preservation are one
fact and must appear together.

**Reduced motion.** Mounted at the verdict, roster and directory already compared, no read-back
sweep.

**Interaction.** A control naming the directory's condition rather than the verdict — *unchanged* /
*a generated file was edited* / *a file that is not ours is here* — so the reader chooses a cause
and reads the consequence. Replay on reselection.

**Risks.**

- Four verdict words (`clean`, `missing`, `changed`, `refused`) is a state machine, and drawing all
  four is a diagram. Three chosen conditions carry the idea; the fourth is documentation.
- Hashes are the mechanism and not the claim. Rendering digests turns a guarantee into
  cryptography theatre.
- Refusing on drift can read as the tool being obstructive unless the preserved foreign file is
  visible in the same frame, which is the reason the refusal exists.

**Homepage fit.** Very low (2). This is a maintainer's guarantee about a build directory. It is a
genuinely good property and it is not what a first-time reader of an interoperability band needs.

**Score: 5 / 4 / 5 / 4 / 4 / 2 = 24. Does not qualify** — homepage fit 2. This is a maintainer's
guarantee about a build directory. It is excellent and it is not what a first-time reader of an
interoperability band needs.

**Better home.** The kit's own documentation, or an authoring/publishing band if one is ever built.

---

### 6.8 Card — the summary is emitted, not truncated

**Motion thesis.** One authored record produces two published records of different depth at the same
moment: a discovery entry carrying only what is safe to browse, and an item document carrying
everything. The shallow record is not the deep one cut short on read; it is emitted shallow.

**Invariant / transform.** *Invariant:* the authored record. *Transform:* two emissions of different
depth. *Why it is true:* `buildIndex` emits `name`, `type`, optional `title`/`description`, and only
`requires` and `provider` under `meta.mantine`; `stylesApi`, the inlined fragment and usage, `props`
and file contents exist only in the item document.

**Settled state.** Both emitted records side by side at their real depths, with the authored record
above them, and the shallow record's omissions named as decisions — discovery-safe — rather than
shown as gaps.

**Reduced motion.** Mounted with both records at full depth; nothing to suppress, because the
concept's content is a comparison rather than a sequence.

**Interaction.** None. The comparison is complete on arrival, which is itself the finding that
disqualifies it as a motion concept.

**Risks.**

- Drawing the shallow record as the deep one with rows removed states the opposite of the claim: it
  is emitted shallow, not truncated on read.
- One source fanning into two outputs is Cast's geometry, and an owner will reach for Cast's rail
  without noticing.
- "Discovery-safe" is a judgement the illustration cannot show; without a caption it reads as an
  arbitrary subset.

**Homepage fit.** Low (3). It supplies a fact the band should carry, in a form the band does not
need.

**Score: 5 / 4 / 3 / 3 / 5 / 3 = 23. Does not qualify** — distinctness 3, motion necessity 3,
homepage fit 3. One record fanning into two destinations is Cast's geometry, and "different readers
see different depth" is Reader's question. It contributes a fact, not a model.

**Disposition.** Fold the index-versus-item depth fact into Reader's caption. Do not build it.

## 7. Scores

| Concept | Product truth | Causal clarity | Distinctness | Motion necessity | Static truth | Homepage fit | Total | Threshold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Reader** | 5 | 5 | 4 | 5 | 5 | 5 | **29** | **Qualifies** |
| **Swap** | 5 | 5 | 5 | 5 | 4 | 4 | **28** | **Qualifies** |
| **Passenger** | 5 | 5 | 4 | 4 | 4 | 4 | **26** | **Qualifies** |
| **Hinge** | 5 | 5 | 4 | 4 | 4 | 4 | **26** | **Qualifies** |
| Recheck | 5 | 4 | 5 | 3 | 4 | 3 | 24 | No — motion 3, fit 3 |
| Address | 5 | 4 | 5 | 2 | 5 | 3 | 24 | No — motion 2, fit 3 |
| Seal | 5 | 4 | 5 | 4 | 4 | 2 | 24 | No — fit 2 |
| Card | 5 | 4 | 3 | 3 | 5 | 3 | 23 | No — distinctness 3, motion 3, fit 3 |

Four qualify against a threshold of 26 with no axis below 4.

## 8. Revision log

The threshold was set before scoring and was not moved to admit a candidate.

1. **Hinge, first framing — 25, homepage fit 3.** Framed as *two malformed enrichment fields, two
   opposite outcomes*. The subject was damage, which at homepage density reads as fragility and
   asks the reader to care about malformed metadata before they have accepted that enrichment
   exists.
   **Revision:** reframe the subject from the damage to the outcome — a successful install that is
   simply missing one affordance, sitting beside the one field whose failure stops everything. Same
   mechanism, same sources, opposite emotional register. Homepage fit 3 → 4, total 25 → 26.
   **Qualifies.**
2. **Card, first framing — a standalone concept, "Two Records".** Scored 3 on distinctness against
   Cast's fan geometry and 3 on motion necessity. No revision was attempted: the honest finding is
   that it carries a fact rather than a model, and the fact belongs in Reader.
3. **"One-way vocabulary" — cut before scoring.** Its claim, that an authored word becomes a wire
   word through a fixed translation, is exactly what the production `InteropStages` already shows
   with `kind` → `type`. Recorded in §9 rather than scored.

4. **Reader, distinctness 4 → 5, proposed on the baseline measurement and declined.** The
   coordinating agent's measurement (§4) established that no neighbouring illustration shows a
   generic and a Manteen-aware reading coexisting, which is direct evidence for the distinctness
   axis. The score was raised to 5 and then returned to 4: the original 4 was docked for sharing a
   subject with the production control, and the measurement does not change that it shares one. The
   evidence is recorded in Reader's score note as corroboration. Reader leads the shortlist at 29
   either way, so nothing downstream depends on the difference — which is the reason to keep the
   more conservative number rather than the reason to move it.

No candidate was revised by weakening a product claim, and none of the four qualifiers required a
change to §2 to qualify.

## 9. Rejected and redundant metaphors

Recorded so a handsome metaphor cannot return under a new visual treatment. The retrospective names
the absence of this log as a cost.

| Metaphor | Verdict |
| --- | --- |
| **One-way vocabulary table** — an authored word passing through a fixed translation into a wire word | **Redundant** with production `InteropStages`, whose entire claim is `kind` → `type` relabelling. |
| **Two clients, two projects** — a generic client and Manteen each installing the same item | **Merged into Reader.** As a standalone it reproduces Cast's two-project geometry and asks Reader's question, adding a second panel and no second idea. |
| **Kiln / pour / foundry batch** for all-or-nothing publication | **Rejected.** A manufacturing metaphor with no product referent. Swap states the same invariant using the transaction the code actually performs, and is therefore checkable. |
| **Pipeline or conveyor with stations** | **Rejected.** Boxes-and-arrows in disguise. It names the stages without showing one — the exact defect the current `Interop` card comment records having removed. |
| **Lock and key, or a passport stamp**, for the compatibility gate | **Rejected.** Duplicates Phase, which owns the gate and draws five readings against one refusal. |
| **Ruler, scale or dial face** for a version range | **Rejected.** Duplicates Gauge. |
| **Concentric registering rings** for any layering idea | **Rejected.** Duplicates Dial, and registration is Dial's whole mechanism. |
| **Syntax-highlight sweep** — the fields a generic client understands light up | **Rejected.** Decorative code highlighting is out of scope for this band, and it makes enrichment look like a colour rather than a behavior with a consequence. |
| **Magnetic field / attraction** | **Rejected.** Already explored as the Field variant, and it explains no causal relationship. |
| **Sealed envelope being opened** for `meta.mantine` | **Rejected as false.** It implies the enrichment is hidden or private. It is open, published, and readable by anyone; it is merely unschema'd for readers who do not know it. Reader's collapse-to-opaque is the truthful version of the same intuition. |
| **A document losing fields as it travels to a lesser client** | **Rejected as false.** Nothing is stripped in transit. The same bytes reach both readers; only the reading differs. Any candidate that removes content on the generic path contradicts §2.4 and §2.5. |

## 10. Resolved evidence finding

Recorded because the method matters and because a prototype owner reading an older checkout may hit
the same thing. No scored concept depended on it, and nothing in §2 or §3 changed as a result.

**The finding.** While grounding §3's installation row, two documents disagreed about how the client
deduplicates items across registries:

- `packages/registry-kit/README.md`, under a **Known limitation** heading, stated that items are
  deduplicated by destination path, so two registries publishing an item of the same name collide
  and the last one installed wins, silently.
- `packages/cli/src/plan/ref.ts` states that identity dedupe keys on the canonical id and on nothing
  else (D8), and describes destination-keyed dedupe as the shipped bug that D8 fixed.
- The refusal table in `docs/contracts/client-build-plan.md` lists `target-collision` (two distinct
  ids, one destination) as a non-forceable error refused at plan time.

The README paragraph therefore described client behavior that the client's own contract records as
refused. This brief did not resolve it — it owns no source outside `docs/research/` — and reported
it instead.

**The resolution, and whose evidence it is.** The coordinating agent verified `ref.ts`, the
collision gate, the contract and the built-Node e2e tier against each other, found they agree that
two distinct ids at one destination refuse before any write, and corrected the README under its own
ownership. It now describes canonical-id dedupe, `target-collision` and receipt-collision refusal,
and durable `resolutions` in `manteen.json`. The stale document was the README.

That verification is the coordinating agent's, not this brief's. This section records a resolved
documentation drift, not an independent re-verification of the collision gate, and it is not
release, CI or deployment evidence.

**Why it is kept.** The retrospective's standing instruction is that a documentation claim is not
evidence until it agrees with the executable source. The general lesson survives the specific fix:
when a README and a contract disagree, the executable source and its e2e tier decide, and the
disagreement is worth surfacing even when the concept work does not depend on it.

## 11. Handoff to prototype owners

### Ownership

The retrospective's finding is that fresh, isolated ownership after shortlisting produced the most
productive refinement pass, and that reusing a collaborator as a supposedly independent critic does
not work. Accordingly:

- One fresh owner per concept: **Reader**, **Swap**, **Passenger**, **Hinge**.
- One writer owns the shared harness. Owners do not edit it.
- Each owner receives §2, §3, §4 and their own subsection of §6 — not the other concepts, and not
  the scores.
- Retain an owner for measured corrections inside their own concept. Bring in a new one for a new
  critical role.

### Files

The coordinating agent established the study route at
`apps/manteen/src/app/prototypes/interop-descriptor/`, mirroring the authoring-descriptor study and
kept separate from it:

- route and harness: `page.tsx`, `prototype-harness.tsx`, `types.ts` — one writer, not the concept
  owners
- concepts: `reader.tsx`, `swap.tsx`, `passenger.tsx`, `hinge.tsx` — one owner each
- `control.tsx` — the production `InteropStages` behavior carried into the picker as a comparison
  slot. This is an addition to what this brief specified and a good one: §4's baseline is measured
  prose, and a control in the same picker makes every claim in it checkable side by side. It is a
  reference, not a concept, and it is not scored.

Support direct variant URLs and replay without adding controls to the illustration itself, as the
existing authoring-descriptor harness does with `?v=`.

**Prototype owners must not touch `apps/manteen/src/components/home/interop.tsx` or
`interop-stages.tsx`.** They are the baseline during exploration. Promotion is a separate,
reversible milestone that copies or extracts the selected concept into a production component; it
does not mutate the picker into production and lose the comparison artifact.

### What each owner owes

Per the retrospective's four-state review and boundary verification:

1. First frame, an intermediate moving frame, the settled frame, and the reduced-motion frame —
   each inspected, not inferred.
2. Replay, rapid reselection, and resize where those interactions exist.
3. Reduced motion starting in the complete settled state, with nonessential motion absent rather
   than shortened.
4. Desktop, 390px and 320px, measuring the relevant child *and* container boxes. A page-level
   overflow check cannot detect content clipped by an `overflow-hidden` ancestor — that defect has
   already occurred once in this study series. The bar to clear is the measured baseline in §4: at
   390px the production control fits its stage controls on one row with no list overflow.
5. `bun run lint`, `bun run site:check`, `bun run site:build`.
6. Fresh browser console and fresh post-reload server output.
7. Accessibility automation, with indeterminate contrast cases resolved by hand. Note that
   `text-fd-muted-foreground` over a tinted panel has previously measured below AA in light mode;
   caption colour is a known open question, not a new finding.
8. Short playback evidence for the shortlisted motion, not screenshots alone.

Keep local, CI, hosted and deployed evidence explicitly separate. A local build proves prototype
quality in one checkout and nothing about deployment.

### Selection

Score the built prototypes on the same six axes in §5 against the same threshold, then compare the
survivors by the question each answers rather than by appearance. If two survivors answer the same
question, change or remove one before polishing either.

Selection update, 2026-08-19: further exploration of Swap produced six additional studies under
`apps/manteen/src/app/prototypes/swap-exploration/`. Study F, **Address and record**, was selected
because one full published plate remains the settled composition in both outcomes, the address is
the only object that crosses on success, and the readings strip makes the no-partial-set guarantee
observable. Its shared drawing was extracted to
`apps/manteen/src/components/home/interop-publication.tsx`; the Study F route remains a reference
wrapper, and `InteropStages` remains checked in as the earlier comparison rather than the homepage
illustration. This is local candidate integration evidence only, not CI, hosted, public, or
deployment evidence.
