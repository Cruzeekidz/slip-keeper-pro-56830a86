/**
 * Centralized storage path builder — organizes uploads by entity + year/month
 */

import type { TransactionType, CategoryGroup } from "./category-constants";

/**
 * Determine entity folder from transaction_type and category_group
 */
export function getEntityFolder(
  transactionType: TransactionType | string | null,
  categoryGroup: CategoryGroup | string | null
): string {
  if (!transactionType || transactionType === "PERSONAL") return "personal";
  if (transactionType === "TRANSFER") return "transfer";
  if (transactionType === "BUSINESS") {
    if (categoryGroup === "ENTITY_BCC_NEXT") return "bcc-next";
    if (categoryGroup === "ENTITY_KUKANANG") return "kukanang";
    return "business";
  }
  return "business";
}

/**
 * Get year/month from a reference date
 */
function getYearMonth(refDate?: Date | string): { year: string; month: string } {
  const d = refDate ? new Date(refDate) : new Date();
  return {
    year: d.getFullYear().toString(),
    month: String(d.getMonth() + 1).padStart(2, "0"),
  };
}

/**
 * Build path for receipt/slip uploads (linked to expenses)
 *
 * Pattern: {entity}/{userId}/{year}/{month}/{fileName}
 */
export function buildReceiptPath(
  transactionType: TransactionType | string | null,
  categoryGroup: CategoryGroup | string | null,
  userId: string,
  fileName: string,
  refDate?: Date | string
): string {
  const entity = getEntityFolder(transactionType, categoryGroup);
  const { year, month } = getYearMonth(refDate);
  return `${entity}/${userId}/${year}/${month}/${fileName}`;
}

/**
 * Build path for other document types (vendor-bills, expense-claims, payment-slips)
 *
 * Pattern: {docType}/{ownerId}/{year}/{month}/{fileName}
 */
export function buildUploadPath(
  docType: "vendor-bills" | "expense-claims" | "payment-slips",
  ownerId: string,
  fileName: string,
  refDate?: Date | string
): string {
  const { year, month } = getYearMonth(refDate);
  return `${docType}/${ownerId}/${year}/${month}/${fileName}`;
}
