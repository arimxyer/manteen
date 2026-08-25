import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();
const configuredBasePath = process.env.MANTEEN_BASE_PATH;

if (
  configuredBasePath !== undefined &&
  configuredBasePath !== "" &&
  !/^\/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:\/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)*$/.test(
    configuredBasePath,
  )
) {
  throw new Error(
    "MANTEEN_BASE_PATH must be empty or an absolute path of alphanumeric, hyphen-separated segments",
  );
}

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  basePath: configuredBasePath || undefined,
};

export default withMDX(config);
