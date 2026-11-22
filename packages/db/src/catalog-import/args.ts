export interface ImportArgs { minSitelinks: number; limit?: number; dryRun: boolean; translate: boolean }

function positiveInteger(flag: string, value: string): number {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) throw new Error(`${flag} must be a positive whole number, got "${value}"`);
  return number;
}

export function parseArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = { minSitelinks: 10, dryRun: false, translate: true };
  for (const arg of argv) {
    const [flag = "", value = ""] = arg.split("=", 2);
    if (flag === "--min-sitelinks") args.minSitelinks = positiveInteger(flag, value);
    else if (flag === "--limit") args.limit = positiveInteger(flag, value);
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-translate") args.translate = false;
    else throw new Error(`Unknown option ${arg}. Options: --min-sitelinks=N --limit=N --dry-run --no-translate`);
  }
  return args;
}
