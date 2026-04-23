// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DecentralisedAuction
/// @author CS218 Team — Decentralised Auction System
/// @notice A permissionless English auction platform where any user can create
///         auctions, place bids, and withdraw losing bids using the withdrawal pattern.
/// @dev Uses OpenZeppelin ReentrancyGuard on withdrawBid to prevent reentrancy attacks.
///      Follows the checks-effects-interactions pattern throughout.
contract DecentralisedAuction is ReentrancyGuard {
    // ───────────────────────────── Types ─────────────────────────────

    /// @notice Represents a single auction
    struct Auction {
        string itemName;
        address payable seller;
        uint256 startingPrice;
        uint256 highestBid;
        address highestBidder;
        uint256 deadline;
        bool ended;
    }

    // ───────────────────────────── State ─────────────────────────────

    /// @notice Total number of auctions created (also used as next auction ID)
    uint256 public auctionCount;

    /// @notice Mapping from auction ID to Auction struct
    mapping(uint256 => Auction) public auctions;

    /// @notice Pending returns for losing bidders: auctionId => bidder => amount
    mapping(uint256 => mapping(address => uint256)) public pendingReturns;

    // ───────────────────────────── Events ────────────────────────────

    /// @notice Emitted when a new auction is created
    /// @param auctionId The ID of the newly created auction
    /// @param seller The address of the auction creator
    /// @param itemName The name of the auctioned item
    /// @param startingPrice The minimum bid price in wei
    /// @param deadline The UNIX timestamp when the auction expires
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        string itemName,
        uint256 startingPrice,
        uint256 deadline
    );

    /// @notice Emitted when a new highest bid is placed
    /// @param auctionId The ID of the auction
    /// @param bidder The address of the bidder
    /// @param amount The bid amount in wei
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    /// @notice Emitted when an auction ends
    /// @param auctionId The ID of the auction
    /// @param winner The address of the highest bidder (or address(0) if no bids)
    /// @param amount The winning bid amount
    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount
    );

    /// @notice Emitted when a losing bidder withdraws their bid
    /// @param auctionId The ID of the auction
    /// @param bidder The address of the withdrawing bidder
    /// @param amount The withdrawn amount in wei
    event BidWithdrawn(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    // ───────────────────────────── Errors ────────────────────────────

    error InvalidItemName();
    error InvalidStartingPrice();
    error InvalidDuration();
    error AuctionDoesNotExist();
    error AuctionAlreadyEnded();
    error AuctionNotExpired();
    error BidTooLow(uint256 required, uint256 sent);
    error SellerCannotBid();
    error NothingToWithdraw();
    error TransferFailed();

    // ──────────────────────── Modifiers ──────────────────────────────

    /// @dev Ensures the auction with the given ID exists
    modifier auctionExists(uint256 auctionId) {
        if (auctionId >= auctionCount) revert AuctionDoesNotExist();
        _;
    }

    /// @dev Ensures the auction has not been ended
    modifier notEnded(uint256 auctionId) {
        if (auctions[auctionId].ended) revert AuctionAlreadyEnded();
        _;
    }

    // ──────────────────── External Functions ─────────────────────────

    /// @notice Creates a new English auction for a named item
    /// @param itemName The name or description of the item being auctioned
    /// @param startingPrice The minimum bid price in wei
    /// @param durationSeconds The auction duration in seconds from now
    /// @return auctionId The ID of the newly created auction
    function createAuction(
        string calldata itemName,
        uint256 startingPrice,
        uint256 durationSeconds
    ) external returns (uint256 auctionId) {
        if (bytes(itemName).length == 0) revert InvalidItemName();
        if (startingPrice == 0) revert InvalidStartingPrice();
        if (durationSeconds == 0) revert InvalidDuration();

        auctionId = auctionCount;

        auctions[auctionId] = Auction({
            itemName: itemName,
            seller: payable(msg.sender),
            startingPrice: startingPrice,
            highestBid: 0,
            highestBidder: address(0),
            deadline: block.timestamp + durationSeconds,
            ended: false
        });

        unchecked {
            ++auctionCount;
        }

        emit AuctionCreated(
            auctionId,
            msg.sender,
            itemName,
            startingPrice,
            block.timestamp + durationSeconds
        );
    }

    /// @notice Places a bid on an active auction. The bid must exceed the current
    ///         highest bid (or the starting price if no bids exist). The previous
    ///         highest bidder's funds are made available for withdrawal (pull pattern).
    /// @param auctionId The ID of the auction to bid on
    function placeBid(uint256 auctionId)
        external
        payable
        auctionExists(auctionId)
        notEnded(auctionId)
    {
        Auction storage auction = auctions[auctionId];

        if (block.timestamp >= auction.deadline) revert AuctionNotExpired(); // deadline passed
        if (msg.sender == auction.seller) revert SellerCannotBid();

        uint256 minimumBid = auction.highestBid > 0
            ? auction.highestBid
            : auction.startingPrice;

        if (msg.value <= minimumBid) {
            revert BidTooLow(minimumBid + 1, msg.value);
        }

        // Make previous highest bid available for withdrawal (pull pattern)
        if (auction.highestBidder != address(0)) {
            pendingReturns[auctionId][auction.highestBidder] += auction.highestBid;
        }

        // Update state
        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    /// @notice Ends an auction after its deadline has passed. Transfers the highest
    ///         bid to the seller. Callable by anyone (permissionless).
    /// @param auctionId The ID of the auction to end
    function endAuction(uint256 auctionId)
        external
        auctionExists(auctionId)
        notEnded(auctionId)
    {
        Auction storage auction = auctions[auctionId];

        if (block.timestamp < auction.deadline) revert AuctionNotExpired();

        // Effects before interactions (CEI pattern)
        auction.ended = true;

        emit AuctionEnded(auctionId, auction.highestBidder, auction.highestBid);

        // Transfer funds to seller (only if there were bids)
        if (auction.highestBid > 0) {
            (bool success, ) = auction.seller.call{value: auction.highestBid}("");
            if (!success) revert TransferFailed();
        }
    }

    /// @notice Allows a losing bidder to withdraw their pending refund.
    ///         Uses the withdrawal (pull) pattern — bidders must call this themselves.
    ///         Protected by ReentrancyGuard to prevent reentrancy attacks.
    /// @param auctionId The ID of the auction to withdraw from
    function withdrawBid(uint256 auctionId)
        external
        nonReentrant
        auctionExists(auctionId)
    {
        uint256 amount = pendingReturns[auctionId][msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        // Zero out before transfer (CEI pattern)
        pendingReturns[auctionId][msg.sender] = 0;

        emit BidWithdrawn(auctionId, msg.sender, amount);

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    // ───────────────────── View Functions ────────────────────────────

    /// @notice Returns full details of an auction
    /// @param auctionId The ID of the auction to query
    /// @return itemName The name of the auctioned item
    /// @return seller The address of the auction creator
    /// @return highestBid The current highest bid in wei
    /// @return highestBidder The address of the current highest bidder
    /// @return deadline The UNIX timestamp when the auction expires
    /// @return ended Whether the auction has been finalised
    function getAuction(uint256 auctionId)
        external
        view
        auctionExists(auctionId)
        returns (
            string memory itemName,
            address seller,
            uint256 highestBid,
            address highestBidder,
            uint256 deadline,
            bool ended
        )
    {
        Auction storage a = auctions[auctionId];
        return (
            a.itemName,
            a.seller,
            a.highestBid,
            a.highestBidder,
            a.deadline,
            a.ended
        );
    }

    /// @notice Returns the pending withdrawal amount for a bidder in a given auction
    /// @param auctionId The auction ID
    /// @param bidder The bidder's address
    /// @return amount The amount available for withdrawal in wei
    function getPendingReturn(uint256 auctionId, address bidder)
        external
        view
        returns (uint256 amount)
    {
        return pendingReturns[auctionId][bidder];
    }
}
