import { PrototypeHarness } from "./prototype-harness";

export default async function AuthoringDescriptorPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string | string[] }>;
}) {
  const value = (await searchParams).v;
  const parsed = Number.parseInt(Array.isArray(value) ? (value[0] ?? "1") : (value ?? "1"), 10);
  const initialVariant = Number.isFinite(parsed) && parsed >= 1 && parsed <= 8 ? parsed - 1 : 0;

  return <PrototypeHarness initialVariant={initialVariant} />;
}
