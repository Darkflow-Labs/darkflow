const normalizeBaseUrl = (value: string) => value.replace(/\/$/, "");

export type PublicSiteUrls = {
  /** Base URL of the Darkflow client (trading console). */
  console: string;
  marketing: string;
  githubOrg: string | null;
  onyxDocs: string | null;
};

/**
 * Public URLs for HQ CTAs. Prefer `NEXT_PUBLIC_CONSOLE_URL`; `NEXT_PUBLIC_DESK_URL`
 * is still read for backward compatibility. Defaults match monorepo dev ports.
 */
export const getPublicSiteUrls = (): PublicSiteUrls => {
  const consoleRaw =
    process.env.NEXT_PUBLIC_CONSOLE_URL?.trim() ||
    process.env.NEXT_PUBLIC_DESK_URL?.trim();
  const marketingRaw = process.env.NEXT_PUBLIC_MARKETING_URL?.trim();
  const githubOrgRaw = process.env.NEXT_PUBLIC_GITHUB_ORG?.trim();
  const onyxDocsRaw = process.env.NEXT_PUBLIC_ONYX_DOCS_URL?.trim();

  return {
    console: normalizeBaseUrl(
      consoleRaw && consoleRaw.length > 0 ? consoleRaw : "http://localhost:3000",
    ),
    marketing: normalizeBaseUrl(
      marketingRaw && marketingRaw.length > 0
        ? marketingRaw
        : "http://localhost:3001",
    ),
    githubOrg: githubOrgRaw && githubOrgRaw.length > 0 ? githubOrgRaw : null,
    onyxDocs: onyxDocsRaw && onyxDocsRaw.length > 0 ? onyxDocsRaw : null,
  };
};
