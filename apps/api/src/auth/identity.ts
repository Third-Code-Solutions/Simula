export interface VerifiedIdentity {
  readonly userId: string;
  readonly issuer: string;
  readonly expiresAt: number;
  readonly sessionId: string;
}

export interface IdentityVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}
