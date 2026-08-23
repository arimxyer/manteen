# Authoring descriptor motion retrospective

[Documentation map](../project-context.md)

Status: point-in-time design-process evidence from 2026-08-19. This document records why the
authoring-descriptor prototypes improved and how to repeat the process. It is neither a product
contract nor proof that any prototype is deployed. The replacement site remains an undeployed
candidate.

## Outcome and evidence boundary

The authoring-descriptor study produced eight concepts on the local prototype route. The original
set is preserved by commit `9f39c3f`; subsequent Phase, Dial, and Cast refinements were deliberately
kept uncommitted while they were compared. All three refined concepts are references, not drop-in
production components:

- **Phase** explains the client compatibility gate. It distinguishes the one installed-version
  result that refuses from compatible, missing-package, missing-install, and Yarn PnP readings.
- **Dial** uses a registering volvelle to explain that the author declares Mantine-native intent
  while `manteen-kit` owns transport.
- **Cast** aligns a shared authored filename with two simultaneous consumer roots to explain that
  the declaration travels unchanged while each project supplies its own destination.

The local evidence included source and contract review, lint and type checks, a production build,
desktop and narrow responsive probes, animated playback review, reduced-motion review,
accessibility automation, and fresh browser-console inspection. That establishes prototype quality
in this checkout. It does not establish production integration, hosted CI, Pages deployment, or
public acceptance.

## What produced the quality jump

### Start from a truthful explanatory model

The strongest concepts do not animate a visual treatment around copy. They give motion a concrete
job in the explanation:

- Phase resolves observable inputs into different CLI outcomes.
- Dial brings independent rings into registration.
- Cast reveals two destinations without implying that one replaces the other.

Each animation can be summarized as a cause and an effect. That constraint made timing, direction,
and settled state easier to judge than when the goal was merely to make a static schema card feel
alive.

### Treat distinctness as a requirement

An attractive concept can still be redundant. The first Phase direction restated Gauge's version
range, sample version, and compatibility result. Comparing the two by the question each answered
exposed the duplication: Gauge answers where a project sits; Phase now answers what the CLI does
with each reading.

Before refining a candidate, write its one-sentence instructional job and compare it with every
nearby illustration. If two candidates answer the same question, change or remove one before
polishing it.

### Prototype the real motion

The later studies used essentially the same choreography that a promoted implementation would use.
This made the picker a credible motion comparison rather than a gallery of static art with token
transitions. Timing, sequencing, label orientation, interruption, and the settled frame could be
evaluated directly.

A motion prototype should be cheap to discard, but not fake the property being evaluated. If the
question is whether a mechanism registers, projects, or resolves clearly, implement that mechanism
far enough to make its choreography reviewable.

### Use fresh, isolated ownership after shortlisting

The most productive refinement pass assigned Phase, Dial, and Cast to three fresh collaborators.
Each received one concept, the product truth it had to preserve, and permission to change both the
illustration and motion. Fresh ownership avoided asking one collaborator to critique assumptions it
had already formed and avoided role drift between concepts.

Continuity is still useful for a bounded follow-up within the same concept. The Dial owner, for
example, was the right person to correct a measured narrow-layout defect after the first pass. The
rule is not always use a new collaborator; it is use a fresh perspective for a new critical role,
then retain ownership for corrections within that role.

### Checkpoint before divergent exploration

Commit `9f39c3f` created a reversible baseline before the three independent refinements. That made
aggressive redesign safe and kept the question of preserving references separate from the question
of promoting one to production.

For future studies, checkpoint a coherent, verified prototype set before independent refinement.
Do not mix the reference commit with production integration or unrelated homepage experiments.

### Make reduced motion a truth test

Reduced motion was useful because it tested the explanatory model, not because every animation
needed a second aesthetic treatment. The earlier Cast settled with one project visually diminished,
which revealed that its metaphor incorrectly implied replacement. A good reduced-motion state is a
complete, truthful still—not the animated state paused at an arbitrary time.

The required questions are:

1. Does the settled frame communicate the same relationship without playback?
2. Are all coexisting facts still present and legible?
3. Is nonessential motion absent rather than merely shortened?

### Review the moving frames and the geometry

Static screenshots were necessary but insufficient. Playback and intermediate-frame contact sheets
revealed whether labels tumbled, whether causality read in the intended order, and whether the
settled state arrived coherently.

Geometry also needs direct measurement. Dial initially reported no document-level horizontal
overflow while a rail was visibly clipped inside an `overflow-hidden` card. Measure the relevant
child and container boxes at the narrow boundary; `scrollWidth === clientWidth` alone cannot detect
content intentionally clipped by an ancestor.

## What cost time or reduced quality

- **Reusing a collaborator as a supposedly independent critic.** A change of prompt does not create
  a fresh point of view. Stop that pass and use a new session when independent critique is the goal.
- **Polishing a literal metaphor before proving it.** The early Cast looked active but did not
  explain why two consumer paths coexist. Evaluate the static causal diagram before tuning easing.
- **Letting a candidate duplicate a neighbor.** Phase initially became another Gauge. Compare
  instructional jobs before implementation.
- **Capping exploration arbitrarily.** The useful concepts appeared after the initial set. Let the
  concept count follow distinct explanatory models, then shortlist with explicit criteria.
- **Using screenshots as the primary motion artifact.** Still images hide timing, interruption,
  label orientation, and sequence. Use playback or frame sequences in addition to screenshots.
- **Treating the prototype harness as production integration.** The picker, replay key, isolated
  card dimensions, and explanatory comments are study infrastructure. They should not leak into the
  homepage component by default.
- **Trusting page overflow checks for nested clipping.** Inspect the actual component geometry at
  320px and nearby widths.

## Repeatable workflow

### 1. Establish the instructional contract

- Read the owning product contract and implementation before drawing.
- Write the exact misconception the illustration must prevent.
- State what the animation's cause, transition, and result represent.
- List neighboring illustrations and confirm the new concept answers a different question.

### 2. Explore genuinely different models

- Produce concepts that differ in explanatory model, not only visual style.
- Do not impose an arbitrary variant cap while distinct useful models remain.
- Give each candidate a motion thesis of no more than two sentences.
- Reject concepts whose settled still is unclear before investing in choreography.

### 3. Build a faithful prototype harness

- Use production tokens and approximately the real content density.
- Implement the essential motion rather than a placeholder approximation.
- Support direct variant URLs and replay without adding controls to the illustration itself.
- Respect the system reduced-motion preference from the first executable version.

### 4. Shortlist, checkpoint, and separate ownership

- Score conceptual distinctness, causal clarity, visual distinction, motion necessity, static truth,
  narrow-layout robustness, and integration cost.
- Commit the coherent shortlist as a reversible reference milestone.
- Give each shortlisted concept a fresh owner or critic with isolated file ownership.
- Keep the same owner for measured corrections within that concept.

### 5. Review four states

For each candidate, inspect:

1. the first frame,
2. an intermediate moving frame,
3. the settled frame, and
4. the reduced-motion frame.

Also test replay, rapid reselection, and resize where those interactions exist. Motion passes only
when every state preserves the product relationship.

### 6. Verify the boundaries that can lie

- Run lint, type generation, and the production build.
- Inspect desktop, 390px, and 320px layouts, including child/container geometry.
- Check browser errors and fresh post-reload server output.
- Run accessibility automation and manually resolve indeterminate contrast cases.
- Confirm reduced motion starts in the complete settled state with no unnecessary animations.
- Keep local, CI, hosted, and deployed evidence explicitly separate.

### 7. Preserve references; promote separately

Keep the accepted studies on the prototype route. Promotion should copy or extract the selected
concept into the production card, then adapt it to the homepage's real dimensions, interaction
model, semantics, performance budget, and surrounding rhythm. Do not mutate the reference study
into production and lose the comparison artifact.

## Path from refined prototype to production

The three refined candidates are ready for selection, not direct insertion. The next production
milestone should:

1. commit the refined Phase, Dial, and Cast files as reference studies;
2. choose the concept whose instructional job best fits the homepage narrative;
3. promote it through a separate production component or extraction;
4. remove picker-only and replay-only assumptions from that component;
5. tighten copy and accessibility semantics in its real context;
6. review its timing alongside the other homepage animations rather than in isolation;
7. repeat responsive, reduced-motion, performance, accessibility, and fresh-console verification;
8. commit production integration as a separate reversible milestone.

## How to improve the next study

- Write the motion thesis and still-frame test before producing visual variants.
- Bring fresh concept owners in immediately after the first shortlist, not after several polish
  cycles.
- Pair subjective critique with one decisive measurement for every reported visual defect.
- Record short playback evidence for shortlisted motion, not only screenshots.
- Evaluate the animation in the full page rhythm earlier, while keeping the prototype as the source
  of comparison.
- Keep an explicit rejection log. Knowing why a handsome concept failed prevents the same metaphor
  from returning under a different visual treatment.
