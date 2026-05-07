#!/usr/bin/env node
import { Command } from "commander";
import { formatEther, parseEther } from "viem";
import {
  createFactoryClient,
  createMarketClient,
  type Address,
} from "@verex/sdk";
import { publicClient, walletClient, accountAddress } from "./clients";

const program = new Command();
program
  .name("verex")
  .description("Verex CLI — drive a fixed-price prediction market on anvil");

program
  .command("create")
  .description("Create a new market via factory")
  .requiredOption("-f, --factory <address>", "factory address")
  .requiredOption("-q, --question <text>", "market question")
  .requiredOption("-e, --end <seconds>", "end time as unix seconds")
  .option("-a, --account <index>", "anvil account index", "0")
  .action(async (opts) => {
    const factory = createFactoryClient({
      address: opts.factory as Address,
      publicClient: publicClient(),
      walletClient: walletClient(parseInt(opts.account, 10)),
    });
    const market = await factory.createMarket(opts.question, BigInt(opts.end));
    console.log(`market: ${market}`);
  });

program
  .command("list")
  .description("List all markets from a factory")
  .requiredOption("-f, --factory <address>", "factory address")
  .action(async (opts) => {
    const factory = createFactoryClient({
      address: opts.factory as Address,
      publicClient: publicClient(),
    });
    const markets = await factory.getMarkets();
    if (markets.length === 0) {
      console.log("(no markets)");
      return;
    }
    for (const addr of markets) {
      const m = createMarketClient({ address: addr, publicClient: publicClient() });
      const info = await m.getInfo();
      const status = info.resolved ? `resolved=${info.outcome ? "YES" : "NO"}` : "open";
      console.log(
        `${addr} | ${status} | yes=${formatEther(info.yesPool)} no=${formatEther(info.noPool)} | ${info.question}`,
      );
    }
  });

program
  .command("info")
  .description("Show full market info")
  .requiredOption("-m, --market <address>", "market address")
  .action(async (opts) => {
    const m = createMarketClient({
      address: opts.market as Address,
      publicClient: publicClient(),
    });
    const info = await m.getInfo();
    console.log(JSON.stringify(info, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  });

program
  .command("buy")
  .description("Buy YES or NO shares")
  .requiredOption("-m, --market <address>", "market address")
  .requiredOption("-s, --side <yes|no>", "yes or no")
  .requiredOption("-v, --value <eth>", "amount in ETH")
  .option("-a, --account <index>", "anvil account index", "1")
  .action(async (opts) => {
    const side = opts.side.toLowerCase();
    if (side !== "yes" && side !== "no") {
      throw new Error("--side must be 'yes' or 'no'");
    }
    const m = createMarketClient({
      address: opts.market as Address,
      publicClient: publicClient(),
      walletClient: walletClient(parseInt(opts.account, 10)),
    });
    const value = parseEther(opts.value);
    const tx = side === "yes" ? await m.buyYes(value) : await m.buyNo(value);
    console.log(`tx: ${tx}`);
  });

program
  .command("resolve")
  .description("Resolve market (owner only)")
  .requiredOption("-m, --market <address>", "market address")
  .requiredOption("-o, --outcome <yes|no>", "winning outcome")
  .option("-a, --account <index>", "anvil account index", "0")
  .action(async (opts) => {
    const outcome = opts.outcome.toLowerCase();
    if (outcome !== "yes" && outcome !== "no") {
      throw new Error("--outcome must be 'yes' or 'no'");
    }
    const m = createMarketClient({
      address: opts.market as Address,
      publicClient: publicClient(),
      walletClient: walletClient(parseInt(opts.account, 10)),
    });
    const tx = await m.resolve(outcome === "yes");
    console.log(`tx: ${tx}`);
  });

program
  .command("claim")
  .description("Claim winnings (no-op if you're a loser)")
  .requiredOption("-m, --market <address>", "market address")
  .option("-a, --account <index>", "anvil account index", "1")
  .action(async (opts) => {
    const idx = parseInt(opts.account, 10);
    const pc = publicClient();
    const m = createMarketClient({
      address: opts.market as Address,
      publicClient: pc,
      walletClient: walletClient(idx),
    });
    const balBefore = await pc.getBalance({ address: accountAddress(idx) });
    const tx = await m.claim();
    const balAfter = await pc.getBalance({ address: accountAddress(idx) });
    console.log(`tx: ${tx}`);
    console.log(`balance change: ${formatEther(balAfter - balBefore)} ETH (incl. gas)`);
  });

program
  .command("position")
  .description("Show a user's position in a market")
  .requiredOption("-m, --market <address>", "market address")
  .option("-a, --account <index>", "anvil account index", "1")
  .action(async (opts) => {
    const idx = parseInt(opts.account, 10);
    const m = createMarketClient({
      address: opts.market as Address,
      publicClient: publicClient(),
    });
    const pos = await m.getPosition(accountAddress(idx));
    console.log(
      `user=${pos.user} yes=${formatEther(pos.yesShares)} no=${formatEther(pos.noShares)}`,
    );
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
