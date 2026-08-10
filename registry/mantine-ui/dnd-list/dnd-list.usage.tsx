import { DndList } from "@/components/ui/dnd-list";

export function ProjectPriorityList() {
  return (
    <DndList
      initialItems={[
        {
          id: "1",
          label: "Ship onboarding redesign",
          description: "Due this Friday",
          leading: "1",
        },
        {
          id: "2",
          label: "Fix billing webhook retries",
          description: "Blocked on infra",
          leading: "2",
        },
        {
          id: "3",
          label: "Write Q3 roadmap draft",
          description: "Needs stakeholder review",
          leading: "3",
        },
        { id: "4", label: "Migrate docs to new theme", description: "Nice to have", leading: "4" },
      ]}
      onChange={(items) =>
        console.log(
          "reordered",
          items.map((item) => item.id),
        )
      }
    />
  );
}
