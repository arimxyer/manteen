import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { InstallTerminal } from "@/components/home/install-terminal";

export function TryItOut() {
  return (
    <div>
      <div className="mx-auto w-full max-w-[860px] rounded-2xl border bg-fd-card p-2 shadow-lg">
        <div className="flex flex-row gap-2 max-sm:flex-col">
          <h2 className="content-center rounded-xl border-2 border-brand/40 px-3 py-1 font-mono text-sm font-bold text-brand uppercase max-sm:text-center">
            Try it out
          </h2>
          <ServerCodeBlock
            code="npm install --save-dev manteen"
            lang="bash"
            codeblock={{ className: "flex-1 bg-fd-secondary my-0" }}
          />
        </div>

        {/* The block above is the command to copy; the terminal below is that same
            command running, and what a project's first init prints after it. */}
        <InstallTerminal className="mt-2" />
      </div>
    </div>
  );
}
