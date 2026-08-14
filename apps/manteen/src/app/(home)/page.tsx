import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Manteen</h1>
      <p className="mb-6 max-w-xl text-fd-muted-foreground">
        A Mantine-native component registry toolchain for authoring, sharing, and maintaining source
        components.
      </p>
      <Link href="/docs" className="font-medium underline underline-offset-4">
        Read the documentation
      </Link>
    </div>
  );
}
