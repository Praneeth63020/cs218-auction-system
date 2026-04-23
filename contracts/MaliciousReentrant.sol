// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DecentralisedAuction.sol";

/// @title MaliciousReentrant
/// @notice A contract that attempts a reentrancy attack on DecentralisedAuction.withdrawBid().
///         Used in test suite to verify that ReentrancyGuard prevents the drain.
contract MaliciousReentrant {
    DecentralisedAuction public auction;
    uint256 public targetAuctionId;
    uint256 public attackCount;

    constructor(address _auction) {
        auction = DecentralisedAuction(_auction);
    }

    /// @notice Places a bid on behalf of this contract
    function bid(uint256 auctionId) external payable {
        targetAuctionId = auctionId;
        auction.placeBid{value: msg.value}(auctionId);
    }

    /// @notice Initiates the reentrancy attack by calling withdrawBid
    function attack(uint256 auctionId) external {
        targetAuctionId = auctionId;
        attackCount = 0;
        auction.withdrawBid(auctionId);
    }

    /// @notice The receive function re-enters withdrawBid when ETH is received
    receive() external payable {
        attackCount++;
        if (attackCount < 3) {
            // Attempt to re-enter withdrawBid
            auction.withdrawBid(targetAuctionId);
        }
    }
}
