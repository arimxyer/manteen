import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { TryItOutDemo } from "@/components/home/try-it-out-demo";

export function TryItOut() {
  return (
    <div>
      <TryItOutDemo
        command={
          <ServerCodeBlock
            code="npm install --save-dev manteen"
            lang="bash"
            codeblock={{
              className: "flex-1 bg-fd-secondary my-0",
              viewportProps: { "aria-label": "Install Manteen command" },
            }}
          />
        }
      />
    </div>
  );
}
