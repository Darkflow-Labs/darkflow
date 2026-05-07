export type SectionMode = "observe" | "sniping" | "sweep";

const SECTION_MODES: SectionMode[] = ["observe", "sniping", "sweep"];

const isSectionMode = (value: string): value is SectionMode =>
  SECTION_MODES.includes(value as SectionMode);

export const parseSectionModeFromArgv = (argv: string[]): SectionMode => {
  const tradeArgIndex = argv.findIndex((arg) => arg === "--trade");
  if (tradeArgIndex !== -1) {
    const tradeValue = argv[tradeArgIndex + 1];
    if (!tradeValue || !isSectionMode(tradeValue)) {
      throw new Error(`Invalid --trade value "${tradeValue ?? ""}". Use observe, sniping, or sweep.`);
    }
    return tradeValue;
  }

  const modeArgIndex = argv.findIndex((arg) => arg === "--mode");
  if (modeArgIndex !== -1) {
    const modeValue = argv[modeArgIndex + 1];
    if (!modeValue || !isSectionMode(modeValue)) {
      throw new Error(`Invalid --mode value "${modeValue ?? ""}". Use observe, sniping, or sweep.`);
    }
    return modeValue;
  }

  const positionalMode = argv.find((arg) => isSectionMode(arg));
  if (positionalMode) {
    return positionalMode;
  }

  return "observe";
};

export const allowsLaunchSource = (sectionMode: SectionMode) => sectionMode === "sniping";

export const allowsSweepDetectorSource = (sectionMode: SectionMode) => sectionMode === "sweep";
