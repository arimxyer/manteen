import { AutocompleteLoading } from "@ui/autocomplete-loading";

async function searchTeamMembers(query: string): Promise<string[]> {
  const response = await fetch(`/api/team-members?q=${encodeURIComponent(query)}`);
  if (!response.ok) return [];
  const results: { name: string }[] = await response.json();
  return results.map((member) => member.name);
}

export function TeamMemberPicker() {
  return (
    <AutocompleteLoading
      label="Assign to"
      placeholder="Search team members"
      debounceMs={300}
      loadOptions={searchTeamMembers}
      shouldQuery={(query) => query.trim().length >= 2}
      onChange={(value) => console.log("value changed", value)}
    />
  );
}
