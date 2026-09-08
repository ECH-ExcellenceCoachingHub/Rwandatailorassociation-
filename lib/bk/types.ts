/**
 * Bank of Kigali OpenAPI types.
 *
 * These types mirror the structure returned by the BK OpenAPI
 * getTransactions endpoint. They are kept separate from the
 * database schema to allow for API response parsing.
 */

export interface BkApiExtras {
  id: string;
  amount: number;
  status: string;
  clientId?: string;
  currency: string;
  narration?: string;
  payeeBank?: string;
  payeeNames?: string;
  payerNames: string;
  payerAccount: string;
  payerContact: string;
  payeeAccount: string;
  paymentCode?: string;
  transferType?: string;
  sourceChannel?: string;
  clientReference?: string;
  createdDate: string;
  updatedDate: string;
}

export interface BkApiTransaction {
  clientId?: string;
  clientReference?: string;
  event?: unknown;
  clientUser?: unknown;
  debitedAccount?: string;
  debitedAccountOwnerNames?: string;
  debitCurrency?: string;
  creditedAccount?: string;
  creditedAccountOwnerNames?: string;
  creditCurrency?: string;
  beneficiaryIdentifier?: string;
  beneficiaryNames?: string;
  beneficiaryBank?: string;
  beneficiaryBankCode?: string;
  amount: number;
  narration?: string;
  serviceCode?: string;
  digitalProfileId?: string;
  transactionReference?: string;
  transactionStatus?: string;
  transactionStage?: string;
  transactionStatusComment?: string;
  extras?: BkApiExtras;
  status?: string;
  createdDate?: string;
  updatedDate?: string;
}

export interface BkApiPage {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}

export interface BkApiResponse {
  content: BkApiTransaction[];
  page: BkApiPage;
}

/**
 * Response of `POST /identity/authenticate`, whose body BK does not publish.
 *
 * Every field is optional because the shape could not be confirmed against a
 * live 200 — the sandbox credentials in use are expired. The adapter reads it
 * through `extractToken`, which names the fields it actually found when none
 * of the candidates match.
 */
export interface BkAuthResponse {
  accessToken?: string;
  access_token?: string;
  token?: string;
  sessionId?: string;
  expiresIn?: number;
  expires_in?: number;
  [key: string]: unknown;
}

/** One row of `GET /identity/getSessions`. */
export interface BkSession {
  sessionId: string;
  sessionOwner: string;
  channel: string;
  sourceIp: string;
  sessionStatus: string;
  createdTime: string;
  updatedTime: string;
  expirationTime: string;
}

/** Body of `POST /payment/claim`. */
export interface BkClaimRequest {
  /** Unique per claim; BK uses it for reconciliation and duplicate detection. */
  clientReference: string;
  /** Six-digit code the payer generates in Internet Banking or the BK app. */
  payerCode: string;
  narration: string;
  amount: number;
}

/** Response of `POST /payment/claim`. */
export interface BkClaimResponse {
  request: BkClaimRequest;
  expiryTime: string;
  status: string;
}

export type BkTransactionStatus = "SUCCESS" | "PENDING" | "FAILED" | "COMPLETED";

export interface BkFetchTransactionsParams {
  page?: number;
  size?: number;
  sort?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface NormalisedBkTransaction {
  bkTransactionId: string;
  bkClientReference: string | null;
  bkTransactionReference: string | null;
  bkPaymentCode: string | null;
  bkExtrasClientReference: string | null;
  amount: string;
  currency: string;
  bkStatus: string | null;
  bkExtrasStatus: string | null;
  payerNames: string | null;
  payerAccount: string | null;
  payerContact: string | null;
  payeeNames: string | null;
  payeeAccount: string | null;
  beneficiaryNames: string | null;
  beneficiaryBank: string | null;
  beneficiaryBankCode: string | null;
  narration: string | null;
  serviceCode: string | null;
  transferType: string | null;
  sourceChannel: string | null;
  transactionStage: string | null;
  transactionStatus: string | null;
  transactionStatusComment: string | null;
  digitalProfileId: string | null;
  debitedAccount: string | null;
  debitedAccountOwnerNames: string | null;
  creditedAccount: string | null;
  creditedAccountOwnerNames: string | null;
  debitCurrency: string | null;
  creditCurrency: string | null;
  debitAccount: string | null;
  creditAccount: string | null;
  transactionDate: Date | null;
  createdDate: Date | null;
  updatedDate: Date | null;
  rawPayload: unknown;
}

export interface BkSyncResult {
  transactionsFetched: number;
  transactionsCreated: number;
  transactionsUpdated: number;
  duplicatesSkipped: number;
  matchedCount: number;
  unmatchedCount: number;
  errorsCount: number;
  nextPage: number | null;
  hasMore: boolean;
}

export interface BkHealthCheck {
  ok: boolean;
  message: string;
  latencyMs: number;
  authenticated: boolean;
  tokenExpiresAt?: Date;
}

export class BkApiError extends Error {
  constructor(
    message: string,
    readonly code:
      | "AUTH_FAILED"
      | "NETWORK"
      | "RATE_LIMITED"
      | "INVALID_RESPONSE"
      | "NOT_CONFIGURED"
      | "SESSION_EXPIRED"
      | "TOKEN_EXPIRED"
      | "UNKNOWN",
    readonly retryable: boolean = false,
    readonly statusCode?: number,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "BkApiError";
  }
}

export interface BkMatchCandidate {
  memberId: string;
  memberNumber: string;
  fullName: string;
  paymentReference: string;
  savingsAccountId: string | null;
}

export interface BkMatchResult {
  strategy: "MEMBER_PAYMENT_REFERENCE" | "EXTERNAL_REFERENCE" | "PAYMENT_CODE" | "PHONE_NUMBER" | "BANK_ACCOUNT" | "PAYER_NAME" | "MANUAL" | "NONE";
  confidence: number;
  member: BkMatchCandidate | null;
  candidates: BkMatchCandidate[];
  evidence: string;
}
