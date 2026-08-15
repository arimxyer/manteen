"use client";

import { useEffect, useState } from "react";
import {
  OwnershipStory,
  STORY,
  type StoryLayout,
  type StoryStep,
} from "@/components/home/ownership-story";
import { card } from "@/components/home/styles";
import { cn } from "@/lib/cn";

const SPEEDS = [
  { label: "1×", factor: 1 },
  { label: "0.5×", factor: 2 },
  { label: "0.25×", factor: 4 },
];

/** Extra passes after the first — what the beam's `repeat` takes. */
const PULSES = [
  { label: "1", repeat: 0 },
  { label: "2", repeat: 1 },
  { label: "3", repeat: 2 },
  { label: "loop", repeat: Number.POSITIVE_INFINITY },
];

const LAYOUTS: { label: string; value: StoryLayout }[] = [
  { label: "Triangle", value: "triangle" },
  { label: "Row", value: "row" },
];

const control =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:text-fd-foreground";

const on = "border-brand bg-brand/10 text-brand";
const off = "text-fd-muted-foreground";

/**
 * A driveable copy of the storyboard, for review only. Motion cannot be judged
 * from a screenshot, so the thing handed over for a decision has to be the thing
 * itself, on one control, at a speed the reviewer picks.
 *
 * The beams are tweens, so slowing them is honest — a tween at a quarter speed
 * is the shipped animation decelerated. (A spring is not: its stiffness and
 * damping ARE its speed, so re-parameterising one gives a different spring of
 * similar shape rather than a recording of the real one. Nothing here is a
 * spring except the caption pips.)
 */
export function OwnershipStoryPreview() {
  const [step, setStep] = useState<StoryStep>(3);
  const [run, setRun] = useState(0);
  const [factor, setFactor] = useState(1);
  const [repeat, setRepeat] = useState(1);
  const [layout, setLayout] = useState<StoryLayout>("triangle");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const hold = (STORY[step]?.hold ?? 0) * factor;
    if (hold === 0) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStep((prev) => (prev + 1) as StoryStep), hold);
    return () => clearTimeout(timer);
  }, [playing, step, factor]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-row flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRun((prev) => prev + 1);
            setStep(0);
            setPlaying(true);
          }}
          className={cn(control, "border-brand text-brand")}
        >
          Play from start
        </button>

        <span className="ml-2 text-xs text-fd-muted-foreground">Beat</span>
        {STORY.map((beat, index) => (
          <button
            key={beat.lead}
            type="button"
            onClick={() => {
              setPlaying(false);
              setRun((prev) => prev + 1);
              setStep(index as StoryStep);
            }}
            className={cn(control, index === step ? on : off)}
          >
            {index + 1}
          </button>
        ))}

        <span className="ml-2 text-xs text-fd-muted-foreground">Speed</span>
        {SPEEDS.map((speed) => (
          <button
            key={speed.label}
            type="button"
            onClick={() => setFactor(speed.factor)}
            className={cn(control, speed.factor === factor ? on : off)}
          >
            {speed.label}
          </button>
        ))}

        <span className="ml-2 text-xs text-fd-muted-foreground">Pulses</span>
        {PULSES.map((pulse) => (
          <button
            key={pulse.label}
            type="button"
            onClick={() => {
              setRepeat(pulse.repeat);
              setRun((prev) => prev + 1);
            }}
            className={cn(control, pulse.repeat === repeat ? on : off)}
          >
            {pulse.label}
          </button>
        ))}

        <span className="ml-2 text-xs text-fd-muted-foreground">Layout</span>
        {LAYOUTS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setLayout(option.value);
              setRun((prev) => prev + 1);
            }}
            className={cn(control, option.value === layout ? on : off)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Held to roughly the width the ownership band gives this card, so the
          proportions under review are the ones that will ship rather than the
          ones a full-width preview flatters. */}
      <div className={cn(card, "flex max-w-[620px] flex-col justify-center")}>
        <OwnershipStory
          step={step}
          beamKey={run * 4 + step}
          beamDuration={1.2 * factor}
          beamRepeat={repeat}
          layout={layout}
        />
      </div>
    </div>
  );
}
