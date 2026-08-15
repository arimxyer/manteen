"use client";

import { useEffect, useState } from "react";
import { OwnershipMerge } from "@/components/home/ownership-merge";
import { OwnershipStory, STORY, type StoryStep } from "@/components/home/ownership-story";
import { card } from "@/components/home/styles";
import { cn } from "@/lib/cn";

const SPEEDS = [
  { label: "1×", factor: 1 },
  { label: "0.5×", factor: 2 },
  { label: "0.25×", factor: 4 },
];

const control =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:text-fd-foreground";

/**
 * A driveable copy of the storyboard, for review only. Motion cannot be judged
 * from a screenshot, so the thing handed over for a decision has to be the thing
 * itself, on one control, at a speed the reviewer picks.
 *
 * The beams are tweens, so slowing them is honest — a tween at a quarter speed
 * is the shipped animation decelerated. (A spring is not: its stiffness and
 * damping ARE its speed, and re-parameterising one produces a different spring
 * of similar shape rather than a recording of the real one.)
 */
export function OwnershipStoryPreview() {
  const [step, setStep] = useState<StoryStep>(3);
  const [run, setRun] = useState(0);
  const [factor, setFactor] = useState(1);
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

  const restart = () => {
    setRun((prev) => prev + 1);
    setStep(0);
    setPlaying(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-row flex-wrap items-center gap-2">
        <button type="button" onClick={restart} className={cn(control, "border-brand text-brand")}>
          Play from start
        </button>

        <span className="ml-2 text-xs text-fd-muted-foreground">Beat</span>
        {STORY.map((_, index) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: the beats are a fixed ordered list.
            key={index}
            type="button"
            onClick={() => {
              setPlaying(false);
              setRun((prev) => prev + 1);
              setStep(index as StoryStep);
            }}
            className={cn(
              control,
              index === step ? "border-brand bg-brand/10 text-brand" : "text-fd-muted-foreground",
            )}
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
            className={cn(
              control,
              speed.factor === factor
                ? "border-brand bg-brand/10 text-brand"
                : "text-fd-muted-foreground",
            )}
          >
            {speed.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-fd-foreground">Proposed — beams storyboard</p>
          <div className={cn(card, "flex flex-col justify-center")}>
            <OwnershipStory step={step} beamKey={run * 4 + step} beamDuration={1.8 * factor} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-fd-foreground">
            On the page today — two documents, hover to replay
          </p>
          <div className={cn(card, "flex flex-col justify-center")}>
            <OwnershipMerge />
          </div>
        </div>
      </div>
    </div>
  );
}
