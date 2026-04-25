import { BentoSection } from "./_components/BentoSection";
import { SiteFooter } from "./_components/SiteFooter";
import { SiteHeader } from "./_components/SiteHeader";
import { TerminalHero } from "./_components/TerminalHero";
import { WaitlistCommand } from "./_components/WaitlistCommand";

const HomePage = () => {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <TerminalHero />
      <WaitlistCommand />
      <BentoSection />
      <SiteFooter />
    </main>
  );
};

export default HomePage;
