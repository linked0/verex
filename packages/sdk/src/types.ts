export enum Outcome {
  Unresolved = 0,
  Yes = 1,
  No = 2,
}

export interface Market {
  id: bigint;
  question: string;
  endTime: bigint;
  outcome: Outcome;
  yesShares: bigint;
  noShares: bigint;
  settled: boolean;
}

export interface VerexClientConfig {
  rpcUrl: string;
  contractAddress: `0x${string}`;
}
