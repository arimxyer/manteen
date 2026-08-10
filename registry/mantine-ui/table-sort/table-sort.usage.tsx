import { TableSort } from "@/components/ui/table-sort";

export function TeamDirectoryTable() {
  return (
    <TableSort
      data={[
        { name: "Robert Wolfkisser", email: "rob_wolf@gmail.com", company: "Canyon Realty" },
        { name: "Jill Jailbreaker", email: "jj@breaker.com", company: "Fishing Corp" },
        { name: "Henry Silkeater", email: "henry@silkeater.io", company: "Wool Charts" },
        { name: "Bill Horsefighter", email: "bhorsefighter@royal.net", company: "Combat Farms" },
        { name: "Jeremy Footviewer", email: "jeremy@foot.dev", company: "Footwork Inc" },
      ]}
      searchPlaceholder="Search team members"
      onRowClick={(row) => console.log("row clicked", row)}
    />
  );
}
