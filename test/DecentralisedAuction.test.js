const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");

describe("DecentralisedAuction", function () {
  // ───────────────── Fixture ─────────────────
  async function deployAuctionFixture() {
    const [owner, seller, bidder1, bidder2, bidder3, anyone] =
      await ethers.getSigners();

    const Auction = await ethers.getContractFactory("DecentralisedAuction");
    const auction = await Auction.deploy();

    const ONE_ETH = ethers.parseEther("1");
    const TWO_ETH = ethers.parseEther("2");
    const THREE_ETH = ethers.parseEther("3");
    const DURATION = 7 * 24 * 60 * 60; // 7 days

    return {
      auction,
      owner,
      seller,
      bidder1,
      bidder2,
      bidder3,
      anyone,
      ONE_ETH,
      TWO_ETH,
      THREE_ETH,
      DURATION,
    };
  }

  // Helper: create a standard auction and return its ID
  async function createStandardAuction(auction, seller, startingPrice, duration) {
    const tx = await auction
      .connect(seller)
      .createAuction("Test Item", startingPrice, duration);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => auction.interface.parseLog(log)?.name === "AuctionCreated"
    );
    return auction.interface.parseLog(event).args.auctionId;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  1. CREATE AUCTION
  // ═══════════════════════════════════════════════════════════════════
  describe("createAuction", function () {
    it("should create an auction with correct parameters", async function () {
      const { auction, seller, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      const tx = await auction.connect(seller).createAuction("Vintage Watch", ONE_ETH, DURATION);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedDeadline = block.timestamp + DURATION;

      await expect(tx)
        .to.emit(auction, "AuctionCreated")
        .withArgs(0, seller.address, "Vintage Watch", ONE_ETH, expectedDeadline);

      const result = await auction.getAuction(0);
      expect(result.itemName).to.equal("Vintage Watch");
      expect(result.seller).to.equal(seller.address);
      expect(result.highestBid).to.equal(0);
      expect(result.highestBidder).to.equal(ethers.ZeroAddress);
      expect(result.ended).to.be.false;
    });

    it("should allow anyone to create an auction (permissionless)", async function () {
      const { auction, bidder1, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      await expect(
        auction.connect(bidder1).createAuction("My Item", ONE_ETH, DURATION)
      ).to.not.be.reverted;
    });

    it("should increment auctionCount correctly", async function () {
      const { auction, seller, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      expect(await auction.auctionCount()).to.equal(0);

      await auction.connect(seller).createAuction("Item 1", ONE_ETH, DURATION);
      expect(await auction.auctionCount()).to.equal(1);

      await auction.connect(seller).createAuction("Item 2", ONE_ETH, DURATION);
      expect(await auction.auctionCount()).to.equal(2);
    });

    it("should revert with empty item name", async function () {
      const { auction, seller, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      await expect(
        auction.connect(seller).createAuction("", ONE_ETH, DURATION)
      ).to.be.revertedWithCustomError(auction, "InvalidItemName");
    });

    it("should revert with zero starting price", async function () {
      const { auction, seller, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      await expect(
        auction.connect(seller).createAuction("Item", 0, DURATION)
      ).to.be.revertedWithCustomError(auction, "InvalidStartingPrice");
    });

    it("should revert with zero duration", async function () {
      const { auction, seller, ONE_ETH } = await loadFixture(
        deployAuctionFixture
      );

      await expect(
        auction.connect(seller).createAuction("Item", ONE_ETH, 0)
      ).to.be.revertedWithCustomError(auction, "InvalidDuration");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  2. PLACE BID
  // ═══════════════════════════════════════════════════════════════════
  describe("placeBid", function () {
    it("should accept a bid above starting price", async function () {
      const { auction, seller, bidder1, ONE_ETH, TWO_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await expect(
        auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH })
      )
        .to.emit(auction, "BidPlaced")
        .withArgs(auctionId, bidder1.address, TWO_ETH);

      const result = await auction.getAuction(auctionId);
      expect(result.highestBid).to.equal(TWO_ETH);
      expect(result.highestBidder).to.equal(bidder1.address);
    });

    it("should revert if bid is below or equal to starting price", async function () {
      const { auction, seller, bidder1, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await expect(
        auction.connect(bidder1).placeBid(auctionId, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(auction, "BidTooLow");

      await expect(
        auction.connect(bidder1).placeBid(auctionId, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWithCustomError(auction, "BidTooLow");
    });

    it("should revert if bid is below current highest bid", async function () {
      const { auction, seller, bidder1, bidder2, ONE_ETH, TWO_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH });

      await expect(
        auction.connect(bidder2).placeBid(auctionId, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(auction, "BidTooLow");
    });

    it("should make previous highest bid available for withdrawal", async function () {
      const { auction, seller, bidder1, bidder2, ONE_ETH, TWO_ETH, THREE_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH });
      await auction.connect(bidder2).placeBid(auctionId, { value: THREE_ETH });

      const pending = await auction.getPendingReturn(auctionId, bidder1.address);
      expect(pending).to.equal(TWO_ETH);
    });

    it("should revert if auction does not exist", async function () {
      const { auction, bidder1, TWO_ETH } = await loadFixture(
        deployAuctionFixture
      );

      await expect(
        auction.connect(bidder1).placeBid(999, { value: TWO_ETH })
      ).to.be.revertedWithCustomError(auction, "AuctionDoesNotExist");
    });

    it("should revert if auction has ended", async function () {
      const { auction, seller, bidder1, bidder2, ONE_ETH, TWO_ETH, THREE_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH });

      // Fast-forward past deadline
      await time.increase(DURATION + 1);
      await auction.connect(seller).endAuction(auctionId);

      await expect(
        auction.connect(bidder2).placeBid(auctionId, { value: THREE_ETH })
      ).to.be.revertedWithCustomError(auction, "AuctionAlreadyEnded");
    });

    it("should revert if auction deadline has passed (not yet ended)", async function () {
      const { auction, seller, bidder1, ONE_ETH, TWO_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await time.increase(DURATION + 1);

      await expect(
        auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH })
      ).to.be.revertedWithCustomError(auction, "AuctionNotExpired");
    });

    it("should revert if seller tries to bid on their own auction", async function () {
      const { auction, seller, ONE_ETH, TWO_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await expect(
        auction.connect(seller).placeBid(auctionId, { value: TWO_ETH })
      ).to.be.revertedWithCustomError(auction, "SellerCannotBid");
    });

    it("should accumulate pending returns for the same bidder outbid multiple times", async function () {
      const { auction, seller, bidder1, bidder2, bidder3, ONE_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      const bid1 = ethers.parseEther("2");
      const bid2 = ethers.parseEther("3");
      const bid3 = ethers.parseEther("4");
      const bid4 = ethers.parseEther("5");

      await auction.connect(bidder1).placeBid(auctionId, { value: bid1 });
      await auction.connect(bidder2).placeBid(auctionId, { value: bid2 });
      await auction.connect(bidder1).placeBid(auctionId, { value: bid3 });
      await auction.connect(bidder2).placeBid(auctionId, { value: bid4 });

      // bidder1 was outbid twice: bid1 + bid3
      expect(await auction.getPendingReturn(auctionId, bidder1.address)).to.equal(
        bid1 + bid3
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  3. END AUCTION
  // ═══════════════════════════════════════════════════════════════════
  describe("endAuction", function () {
    it("should end auction and transfer funds to seller", async function () {
      const { auction, seller, bidder1, ONE_ETH, TWO_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH });

      await time.increase(DURATION + 1);

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

      await expect(auction.connect(seller).endAuction(auctionId))
        .to.emit(auction, "AuctionEnded")
        .withArgs(auctionId, bidder1.address, TWO_ETH);

      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);

      // Seller should have received highestBid (minus gas)
      expect(sellerBalanceAfter).to.be.greaterThan(sellerBalanceBefore);

      const result = await auction.getAuction(auctionId);
      expect(result.ended).to.be.true;
    });

    it("should allow anyone to end the auction after deadline", async function () {
      const { auction, seller, bidder1, anyone, ONE_ETH, TWO_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );
      await auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH });

      await time.increase(DURATION + 1);

      // A random address (not the seller) can end it
      await expect(auction.connect(anyone).endAuction(auctionId)).to.not.be
        .reverted;
    });

    it("should revert if auction has not expired", async function () {
      const { auction, seller, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await expect(
        auction.connect(seller).endAuction(auctionId)
      ).to.be.revertedWithCustomError(auction, "AuctionNotExpired");
    });

    it("should revert if auction already ended", async function () {
      const { auction, seller, bidder1, ONE_ETH, TWO_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );
      await auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH });

      await time.increase(DURATION + 1);
      await auction.endAuction(auctionId);

      await expect(
        auction.endAuction(auctionId)
      ).to.be.revertedWithCustomError(auction, "AuctionAlreadyEnded");
    });

    it("should handle auction with no bids (no ETH transfer)", async function () {
      const { auction, seller, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await time.increase(DURATION + 1);

      await expect(auction.endAuction(auctionId))
        .to.emit(auction, "AuctionEnded")
        .withArgs(auctionId, ethers.ZeroAddress, 0);
    });

    it("seller receives exactly the highestBid amount", async function () {
      const { auction, seller, bidder1, anyone, ONE_ETH, TWO_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );
      await auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH });

      await time.increase(DURATION + 1);

      // Have a third party end it so seller doesn't pay gas
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await auction.connect(anyone).endAuction(auctionId);
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      expect(sellerAfter - sellerBefore).to.equal(TWO_ETH);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  4. WITHDRAW BID
  // ═══════════════════════════════════════════════════════════════════
  describe("withdrawBid", function () {
    it("should allow losing bidder to withdraw their exact bid amount", async function () {
      const { auction, seller, bidder1, bidder2, ONE_ETH, TWO_ETH, THREE_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH });
      await auction.connect(bidder2).placeBid(auctionId, { value: THREE_ETH });

      const balanceBefore = await ethers.provider.getBalance(bidder1.address);

      await expect(auction.connect(bidder1).withdrawBid(auctionId))
        .to.emit(auction, "BidWithdrawn")
        .withArgs(auctionId, bidder1.address, TWO_ETH);

      const balanceAfter = await ethers.provider.getBalance(bidder1.address);

      // Should have received back their bid (minus gas)
      expect(balanceAfter).to.be.greaterThan(balanceBefore);

      // Pending returns should now be zero
      expect(
        await auction.getPendingReturn(auctionId, bidder1.address)
      ).to.equal(0);
    });

    it("should revert if nothing to withdraw", async function () {
      const { auction, seller, bidder1, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await expect(
        auction.connect(bidder1).withdrawBid(auctionId)
      ).to.be.revertedWithCustomError(auction, "NothingToWithdraw");
    });

    it("should revert on double withdrawal", async function () {
      const { auction, seller, bidder1, bidder2, ONE_ETH, TWO_ETH, THREE_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH });
      await auction.connect(bidder2).placeBid(auctionId, { value: THREE_ETH });

      await auction.connect(bidder1).withdrawBid(auctionId);

      await expect(
        auction.connect(bidder1).withdrawBid(auctionId)
      ).to.be.revertedWithCustomError(auction, "NothingToWithdraw");
    });

    it("should revert for non-existent auction", async function () {
      const { auction, bidder1 } = await loadFixture(deployAuctionFixture);

      await expect(
        auction.connect(bidder1).withdrawBid(999)
      ).to.be.revertedWithCustomError(auction, "AuctionDoesNotExist");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  5. REENTRANCY ATTACK TEST
  // ═══════════════════════════════════════════════════════════════════
  describe("Reentrancy Protection", function () {
    it("should prevent reentrancy attack on withdrawBid", async function () {
      const { auction, seller, bidder1, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      // Deploy malicious contract
      const MaliciousReentrant = await ethers.getContractFactory(
        "MaliciousReentrant"
      );
      const attacker = await MaliciousReentrant.deploy(
        await auction.getAddress()
      );

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      // Attacker bids 2 ETH
      await attacker.bid(auctionId, { value: ethers.parseEther("2") });

      // Someone else outbids — attacker now has pending returns
      await auction
        .connect(bidder1)
        .placeBid(auctionId, { value: ethers.parseEther("3") });

      // Attacker has 2 ETH in pending returns
      const pending = await auction.getPendingReturn(
        auctionId,
        await attacker.getAddress()
      );
      expect(pending).to.equal(ethers.parseEther("2"));

      // Reentrancy attack should fail
      await expect(attacker.attack(auctionId)).to.be.reverted;

      // Contract balance should NOT have been drained
      const contractBalance = await ethers.provider.getBalance(
        await auction.getAddress()
      );
      // Should still hold bidder1's 3 ETH (attacker failed to drain)
      expect(contractBalance).to.be.greaterThanOrEqual(
        ethers.parseEther("3")
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  6. FULL HAPPY PATH (end-to-end)
  // ═══════════════════════════════════════════════════════════════════
  describe("Full Happy Path", function () {
    it("complete auction lifecycle: create → bid → outbid → end → withdraw", async function () {
      const { auction, seller, bidder1, bidder2, bidder3, anyone, ONE_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      // 1. Create auction
      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      // 2. Three bidders bid
      await auction
        .connect(bidder1)
        .placeBid(auctionId, { value: ethers.parseEther("2") });
      await auction
        .connect(bidder2)
        .placeBid(auctionId, { value: ethers.parseEther("3") });
      await auction
        .connect(bidder3)
        .placeBid(auctionId, { value: ethers.parseEther("5") });

      // 3. Verify highest bidder
      const auctionData = await auction.getAuction(auctionId);
      expect(auctionData.highestBidder).to.equal(bidder3.address);
      expect(auctionData.highestBid).to.equal(ethers.parseEther("5"));

      // 4. Time travel past deadline
      await time.increase(DURATION + 1);

      // 5. End auction — seller receives highest bid
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await auction.connect(anyone).endAuction(auctionId);
      const sellerAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerAfter - sellerBefore).to.equal(ethers.parseEther("5"));

      // 6. Losing bidders withdraw their bids
      const b1Before = await ethers.provider.getBalance(bidder1.address);
      await auction.connect(bidder1).withdrawBid(auctionId);
      const b1After = await ethers.provider.getBalance(bidder1.address);
      expect(b1After).to.be.greaterThan(b1Before);

      const b2Before = await ethers.provider.getBalance(bidder2.address);
      await auction.connect(bidder2).withdrawBid(auctionId);
      const b2After = await ethers.provider.getBalance(bidder2.address);
      expect(b2After).to.be.greaterThan(b2Before);

      // 7. Winner (bidder3) should have nothing to withdraw
      await expect(
        auction.connect(bidder3).withdrawBid(auctionId)
      ).to.be.revertedWithCustomError(auction, "NothingToWithdraw");

      // 8. No further bids accepted
      await expect(
        auction
          .connect(bidder1)
          .placeBid(auctionId, { value: ethers.parseEther("10") })
      ).to.be.revertedWithCustomError(auction, "AuctionAlreadyEnded");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  7. EDGE CASES
  // ═══════════════════════════════════════════════════════════════════
  describe("Edge Cases", function () {
    it("should handle multiple concurrent auctions independently", async function () {
      const { auction, seller, bidder1, bidder2, ONE_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId1 = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );
      const auctionId2 = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      await auction
        .connect(bidder1)
        .placeBid(auctionId1, { value: ethers.parseEther("2") });
      await auction
        .connect(bidder2)
        .placeBid(auctionId2, { value: ethers.parseEther("3") });

      const a1 = await auction.getAuction(auctionId1);
      const a2 = await auction.getAuction(auctionId2);

      expect(a1.highestBidder).to.equal(bidder1.address);
      expect(a2.highestBidder).to.equal(bidder2.address);
    });

    it("should handle very short auction duration", async function () {
      const { auction, seller, bidder1, ONE_ETH } = await loadFixture(
        deployAuctionFixture
      );

      // 1-second auction
      const auctionId = await createStandardAuction(auction, seller, ONE_ETH, 1);

      await time.increase(2);

      await expect(
        auction.connect(bidder1).placeBid(auctionId, { value: ethers.parseEther("2") })
      ).to.be.revertedWithCustomError(auction, "AuctionNotExpired");
    });

    it("should handle getAuction on non-existent ID", async function () {
      const { auction } = await loadFixture(deployAuctionFixture);

      await expect(auction.getAuction(0)).to.be.revertedWithCustomError(
        auction,
        "AuctionDoesNotExist"
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  8. TIME-TRAVEL TESTS
  // ═══════════════════════════════════════════════════════════════════
  describe("Time-based behaviour", function () {
    it("bids accepted before deadline, rejected at/after deadline", async function () {
      const { auction, seller, bidder1, bidder2, ONE_ETH, TWO_ETH, DURATION } =
        await loadFixture(deployAuctionFixture);

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      // Bid 1 second before deadline — should succeed
      await time.increase(DURATION - 2);
      await expect(
        auction.connect(bidder1).placeBid(auctionId, { value: TWO_ETH })
      ).to.not.be.reverted;

      // Advance past deadline
      await time.increase(3);

      // Bid after deadline — should fail
      await expect(
        auction
          .connect(bidder2)
          .placeBid(auctionId, { value: ethers.parseEther("3") })
      ).to.be.revertedWithCustomError(auction, "AuctionNotExpired");
    });

    it("endAuction callable exactly at deadline", async function () {
      const { auction, seller, ONE_ETH, DURATION } = await loadFixture(
        deployAuctionFixture
      );

      const auctionId = await createStandardAuction(
        auction, seller, ONE_ETH, DURATION
      );

      // Get the actual deadline from the auction
      const auctionData = await auction.getAuction(auctionId);
      const deadline = auctionData.deadline;

      // Move to exactly deadline
      await time.increaseTo(deadline);

      await expect(auction.endAuction(auctionId)).to.not.be.reverted;
    });
  });
});
