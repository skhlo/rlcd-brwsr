import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  JEV_TRIAL_LEDGER_PATH,
  registerRlcdBrwsr,
} from "../../config/pi/extensions/rlcd-brwsr.ts";

export default function issueSixRealJevExtension(pi: ExtensionAPI): void {
  registerRlcdBrwsr(pi, {
    typeSafe: {
      ledgerPath:
        process.env.RLCD_JEV_TRIAL_LEDGER_PATH || JEV_TRIAL_LEDGER_PATH,
      trialIssue: 6,
      trialPurpose:
        process.env.RLCD_JEV_TRIAL_PURPOSE || "issue #6 research workflow",
    },
  });
}
