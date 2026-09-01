/**
 * Data-only source for packaged agent guidance, CLI guide output, and docs.
 * Keep this module free of Node APIs and side effects so Astro can import it.
 */

export const MANTEEN_AGENT_MANIFEST = {
  schemaVersion: 1,
  guideVersion: 3,
  product: {
    name: "Manteen",
    description: "Mantine-native registry authoring and source maintenance",
    docs: "https://arimxyer.github.io/manteen/",
  },
  releases: {
    publishedClientAtContractFreeze: "0.5.0",
    machineInterfaceMilestone: "0.6.0",
    agentWorkflowMilestone: "0.7.0",
    documentedClientRelease: "0.9.2",
    minimumNode: "22.12.0",
  },
  machineInterface: {
    schemaVersion: 1,
    jsonFlag: "--json",
    planExpectationFlag: "--expect-plan",
    invariant: "ok is exactly exitCode === 0",
  },
  skill: {
    name: "manteen",
    packagedPath: "skill/manteen",
    defaultProjectTarget: ".agents/skills/manteen",
  },
  commands: [
    {
      name: "init",
      mode: "write",
      purpose: "Detect and configure a supported Mantine application.",
      agentContract: "0.6.0",
    },
    {
      name: "add",
      mode: "write",
      purpose: "Resolve, plan, and install registry items.",
      agentContract: "0.6.0",
    },
    {
      name: "list",
      mode: "read",
      purpose: "Discover configured registry items deterministically.",
      agentContract: "0.6.0",
    },
    {
      name: "info",
      mode: "read",
      purpose: "Inspect one item's complete install and display metadata.",
      agentContract: "0.6.0",
    },
    {
      name: "diff",
      mode: "read",
      purpose: "Compare local, pristine-base, and current upstream state.",
      agentContract: "0.6.0",
    },
    {
      name: "update",
      mode: "write",
      purpose: "Three-way merge upstream changes around local adaptations.",
      agentContract: "0.6.0",
    },
    {
      name: "remove",
      mode: "write",
      purpose: "Remove exact receipt-owned files proven absent upstream.",
      agentContract: "0.6.0",
    },
    {
      name: "status",
      mode: "read",
      purpose: "Assess local project and receipt health without network access.",
      agentContract: "0.7.0",
    },
    {
      name: "agent guide",
      mode: "read",
      purpose: "Print the packaged agent guide without project configuration.",
      agentContract: "0.7.0",
    },
    {
      name: "agent install",
      mode: "write",
      purpose: "Safely install or update the packaged Manteen skill.",
      agentContract: "0.7.0",
    },
  ],
} as const;

export type ManteenAgentManifest = typeof MANTEEN_AGENT_MANIFEST;
