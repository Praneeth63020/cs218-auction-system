const hre = require("hardhat");

async function main() {
  console.log("Deploying DecentralisedAuction...");

  const Auction = await hre.ethers.getContractFactory("DecentralisedAuction");
  const auction = await Auction.deploy();

  await auction.waitForDeployment();

  const address = await auction.getAddress();
  console.log(`DecentralisedAuction deployed to: ${address}`);
  console.log("---");
  console.log("To interact with the contract:");
  console.log(`  Contract address: ${address}`);
  console.log("  Network: localhost (Hardhat node)");
  console.log("");
  console.log("Example usage:");
  console.log("  1. Start Hardhat node:  npx hardhat node");
  console.log("  2. Deploy:             npx hardhat run scripts/deploy.js --network localhost");
  console.log("  3. Open frontend:      cd frontend && npm start");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
