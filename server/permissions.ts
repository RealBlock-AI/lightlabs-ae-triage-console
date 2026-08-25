import { and, eq, or } from "drizzle-orm";
import { products, tests } from "../drizzle/schema";
import { companyMemberships, partnerships, reports, samples, skus } from "../drizzle/canonicalSchema";
import { getDb } from "./db";

export type ResultVisibilityCode = "RESULT_NOT_FOUND" | "RESULT_UNRELEASED" | "RESULT_REPORT_DENIED" | "RESULT_MEMBERSHIP_DENIED" | "RESULT_PARTNERSHIP_DENIED";

export class ResultVisibilityError extends Error {
  constructor(public readonly code: ResultVisibilityCode, message: string) { super(message); this.name = "ResultVisibilityError"; }
}

export async function assertResultVisible(requestingUserId: number, testId: string, options: { reportRequired?: boolean; comanCoa?: boolean } = {}) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const joined = (await db.select({ test: tests, sample: samples, sku: skus, product: products }).from(tests)
    .leftJoin(samples, eq(tests.sampleId, samples.id)).leftJoin(skus, eq(samples.skuId, skus.id)).leftJoin(products, eq(skus.productId, products.id))
    .where(eq(tests.id, testId)).limit(1))[0];
  if (!joined?.test || !joined.sample || !joined.sku || !joined.product?.companyId) throw new ResultVisibilityError("RESULT_NOT_FOUND", "The selected result cannot be resolved to an owning company.");
  if (!joined.test.publishedAt) throw new ResultVisibilityError("RESULT_UNRELEASED", "This completed test has not been released to the customer.");
  if (options.reportRequired) {
    const report = (await db.select().from(reports).where(eq(reports.testId, testId)).limit(1))[0];
    if (!report || (!report.isPublic && !report.datePublished)) throw new ResultVisibilityError("RESULT_REPORT_DENIED", "The related report has not been published for customer visibility.");
  }
  const memberships = await db.select().from(companyMemberships).where(and(eq(companyMemberships.userId, requestingUserId), eq(companyMemberships.viewResults, 1)));
  if (!memberships.length) throw new ResultVisibilityError("RESULT_MEMBERSHIP_DENIED", "The requesting user does not have permission to view results.");
  const ownerCompanyId = joined.product.companyId;
  const direct = memberships.find(membership => membership.companyId === ownerCompanyId);
  if (direct) return { ownerCompanyId, requesterCompanyId: ownerCompanyId, direct: true, test: joined.test, sample: joined.sample, sku: joined.sku, product: joined.product };
  for (const membership of memberships) {
    const relationshipPredicate = and(
      eq(partnerships.active, 1),
      eq(partnerships.viewResults, 1),
      or(
        and(eq(partnerships.sourceCompanyId, membership.companyId), eq(partnerships.targetCompanyId, ownerCompanyId)),
        and(eq(partnerships.sourceCompanyId, ownerCompanyId), eq(partnerships.targetCompanyId, membership.companyId)),
      ),
    );
    const relationship = (await db.select().from(partnerships).where(relationshipPredicate).limit(1))[0];
    if (relationship && (!options.comanCoa || membership.receiveComanCoas)) return { ownerCompanyId, requesterCompanyId: membership.companyId, direct: false, test: joined.test, sample: joined.sample, sku: joined.sku, product: joined.product };
  }
  throw new ResultVisibilityError("RESULT_PARTNERSHIP_DENIED", "The requester has no result-visible partnership for this product owner.");
}
