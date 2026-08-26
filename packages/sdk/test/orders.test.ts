import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";

import {
  hashOrder,
  recoverOrderSigner,
  signOrder,
  Side,
  SignatureType,
  type Order,
  type OrderDomain,
} from "../src";

// Golden values produced by `forge script script/EmitOrderHash.s.sol` in
// packages/contracts. Regenerate by running that script and updating both
// `EXCHANGE_ADDRESS` and `EXPECTED_DIGEST` together — they are tied to
// the deterministic deploy address in the script's `setUp`.
const CHAIN_ID = 31337;
const EXCHANGE_ADDRESS = "0xf13D09eD3cbdD1C930d4de74808de1f33B6b3D4f" as const;
const EXPECTED_DIGEST =
  "0x68d8d9bd3897ca4fc1977b681d787f0da781b37f9f91c0b0b7a0fe7292571f93" as const;

// The exact Order built inside EmitOrderHash.s.sol. Field-for-field parity
// is what makes the digest comparison meaningful — any divergence here
// would mask an SDK schema bug.
const ORDER: Order = {
  salt: 12345n,
  maker: "0x1111111111111111111111111111111111111111",
  signer: "0x1111111111111111111111111111111111111111",
  taker: "0x0000000000000000000000000000000000000000",
  tokenId: 0xabcdef0123456789n,
  makerAmount: 60_000_000n,
  takerAmount: 100_000_000n,
  expiration: 0n,
  nonce: 7n,
  feeRateBps: 0n,
  side: Side.BUY,
  signatureType: SignatureType.EOA,
  signature: "0x",
};

const DOMAIN: OrderDomain = {
  chainId: CHAIN_ID,
  verifyingContract: EXCHANGE_ADDRESS,
};

describe("hashOrder", () => {
  it("matches the on-chain CTFExchange.hashOrder digest", () => {
    expect(hashOrder(ORDER, DOMAIN)).toBe(EXPECTED_DIGEST);
  });
});

describe("signOrder", () => {
  // anvil account[0]'s key — well-known, used everywhere in the repo. The
  // corresponding address must match ORDER.maker for the signature to
  // recover to the right party.
  const ANVIL_PK_0 =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

  it("produces a signature that recovers to the maker address", async () => {
    // Sign over an order whose `maker` field matches the signing key, so
    // recovery validates the cryptographic side of the SDK as well as the
    // digest construction.
    const account = privateKeyToAccount(ANVIL_PK_0);
    const order: Order = { ...ORDER, maker: account.address, signer: account.address };
    const signed = await signOrder(order, DOMAIN, account);

    expect(signed.signature).not.toBe("0x");
    expect(signed.signature.length).toBe(2 + 130); // 0x + r(64) + s(64) + v(2)

    const recovered = await recoverTypedDataAddress({
      domain: {
        name: "Polymarket CTF Exchange",
        version: "1",
        chainId: CHAIN_ID,
        verifyingContract: EXCHANGE_ADDRESS,
      },
      types: {
        Order: [
          { name: "salt", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "signer", type: "address" },
          { name: "taker", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "makerAmount", type: "uint256" },
          { name: "takerAmount", type: "uint256" },
          { name: "expiration", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "feeRateBps", type: "uint256" },
          { name: "side", type: "uint8" },
          { name: "signatureType", type: "uint8" },
        ],
      },
      primaryType: "Order",
      message: {
        salt: order.salt,
        maker: order.maker,
        signer: order.signer,
        taker: order.taker,
        tokenId: order.tokenId,
        makerAmount: order.makerAmount,
        takerAmount: order.takerAmount,
        expiration: order.expiration,
        nonce: order.nonce,
        feeRateBps: order.feeRateBps,
        side: order.side,
        signatureType: order.signatureType,
      },
      signature: signed.signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("accepts a raw private-key signer", async () => {
    const signed = await signOrder(ORDER, DOMAIN, { privateKey: ANVIL_PK_0 });
    expect(signed.signature).not.toBe("0x");
  });
});

// `recoverOrderSigner` is what the API uses to admit a client-signed order it
// holds no key for, so these are the two cases that matter: a real signature
// recovers to its signer, and terms altered after signing do not.
describe("recoverOrderSigner", () => {
  const domain: OrderDomain = { chainId: CHAIN_ID, verifyingContract: EXCHANGE_ADDRESS };
  const key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
  const account = privateKeyToAccount(key);

  it("recovers the address that signed the order", async () => {
    const signed = await signOrder({ ...ORDER, maker: account.address, signer: account.address }, domain, account);
    const recovered = await recoverOrderSigner(signed, domain);
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("does not recover the signer once the terms are altered", async () => {
    const signed = await signOrder({ ...ORDER, maker: account.address, signer: account.address }, domain, account);
    // A taker paying less than was signed for — the tamper the server must
    // catch, and the one a drifted second copy of ORDER_TYPES would produce.
    const tampered = { ...signed, makerAmount: signed.makerAmount - 1n };
    const recovered = await recoverOrderSigner(tampered, domain);
    expect(recovered.toLowerCase()).not.toBe(account.address.toLowerCase());
  });

  it("rejects an unsigned order rather than recovering nonsense", async () => {
    await expect(recoverOrderSigner({ ...ORDER, signature: "0x" }, domain)).rejects.toThrow(/no signature/);
  });
});
