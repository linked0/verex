import { defineChain } from "viem";

/// The Jayverse devnet — chain 313370, the primary deployment target.
///
/// TODO: move to @jayverse/rails. Vendored here because that package has no
/// git remote yet and Cloud Run builds only from this repo, so a
/// `file:../jayverse-rails` dependency would resolve locally and break in the
/// cloud. Replace with an import once rails is published.
///
/// 313370 is deliberately not 31337: 31337 means "localhost" to every tool,
/// and EIP-155 scopes replay protection to the chain id, so a signature made
/// on the hosted devnet is worthless on a local fork and on real Sepolia.
export const jayverseDevnet = defineChain({
  id: 313370,
  name: "Jayverse Devnet",
  nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://devnet.jaylabs.xyz/rpc"],
      webSocket: ["wss://devnet.jaylabs.xyz/ws"],
    },
  },
  blockExplorers: {
    default: { name: "Otterscan", url: "https://devnet.jaylabs.xyz/explorer" },
  },
  testnet: true,
});

export const JAYVERSE_DEVNET_ID = 313370;
