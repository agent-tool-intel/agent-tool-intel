// Outreach Guard — database-level enforcement. CANNOT BE BYPASSED.
// Before ANY outreach: call canSend(owner). After sending: call recordSend().
// Rule: ONE issue per owner. FOREVER. No exceptions.

import { db } from "../db/index.js";
import { outreachLog } from "../db/schema.js";
import { eq, or, and } from "drizzle-orm";

const BLACKLIST_OWNERS = new Set([
  // Known rejectors / spammed — never contact again
  "cameronrye", "blackwell-systems", "averatec0773", "zoharbabin",
  "dcostenco", "dejo1307", "ihorponom", "nikolai-vysotskyi",
  "patdolitse", "mi4uu", "cyanheads", "alex lisenko",
  "dylanroscover", "getsentry", "elastic", "microsoft",
  "mihaelamj", "clowlove",
]);

export interface OutreachRecord {
  owner: string;
  repo: string;
  issueUrl?: string;
  status: "sent" | "accepted" | "rejected" | "spam";
}

export async function canSend(owner: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const ownerLower = owner.toLowerCase();

  // 1. Check blacklist (hard block)
  if (BLACKLIST_OWNERS.has(ownerLower)) {
    return { allowed: false, reason: `Owner "${owner}" is blacklisted — never contact again` };
  }

  // 2. Check if already sent to this owner (database)
  const existing = await db
    .select({ id: outreachLog.id, repo: outreachLog.repo, status: outreachLog.status })
    .from(outreachLog)
    .where(eq(outreachLog.owner, ownerLower))
    .limit(1);

  if (existing.length > 0) {
    return {
      allowed: false,
      reason: `Already sent to "${owner}" on ${existing[0]!.repo} (status: ${existing[0]!.status})`,
    };
  }

  return { allowed: true };
}

export async function recordSend(record: OutreachRecord): Promise<void> {
  await db.insert(outreachLog).values({
    owner: record.owner.toLowerCase(),
    repo: record.repo,
    issueUrl: record.issueUrl || null,
    status: record.status,
  });
}

export async function markOwnerStatus(
  owner: string,
  status: "accepted" | "rejected" | "spam"
): Promise<void> {
  await db
    .update(outreachLog)
    .set({ status })
    .where(eq(outreachLog.owner, owner.toLowerCase()));
}

export async function getOutreachStats(): Promise<{
  totalSent: number;
  uniqueOwners: number;
  accepted: number;
  rejected: number;
  spam: number;
}> {
  const all = await db.select().from(outreachLog);
  const uniqueOwners = new Set(all.map((r) => r.owner)).size;
  return {
    totalSent: all.length,
    uniqueOwners,
    accepted: all.filter((r) => r.status === "accepted").length,
    rejected: all.filter((r) => r.status === "rejected").length,
    spam: all.filter((r) => r.status === "spam").length,
  };
}

// NEVER bypass this check before sending outreach.
// Usage: const { allowed, reason } = await canSend("some-owner");
// if (!allowed) { console.log("SKIP:", reason); return; }
// ... send outreach ...
// await recordSend({ owner, repo, issueUrl, status: "sent" });
