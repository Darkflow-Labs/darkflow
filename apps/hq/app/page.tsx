import { getPublicSiteUrls } from "@/lib/siteUrls";

import { HqFooter } from "./_components/HqFooter";
import { HqHeader } from "./_components/HqHeader";
import { LabsHero } from "./_components/LabsHero";
import { ProjectsSection } from "./_components/ProjectsSection";
import { SandboxAccessSection } from "./_components/SandboxAccessSection";
import { ToolkitSection } from "./_components/ToolkitSection";

const HomePage = () => {
  const urls = getPublicSiteUrls();

  return (
    <main className="flex flex-1 flex-col">
      <HqHeader urls={urls} />
      <LabsHero />
      <ProjectsSection urls={urls} />
      <ToolkitSection urls={urls} />
      <SandboxAccessSection />
      <HqFooter />
    </main>
  );
};

export default HomePage;
