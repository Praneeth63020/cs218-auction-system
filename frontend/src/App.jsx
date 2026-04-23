import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

// ─── Contract ABI (from compiled DecentralisedAuction) ───
const CONTRACT_ABI = [
  "function createAuction(string calldata itemName, uint256 startingPrice, uint256 durationSeconds) external returns (uint256)",
  "function placeBid(uint256 auctionId) external payable",
  "function endAuction(uint256 auctionId) external",
  "function withdrawBid(uint256 auctionId) external",
  "function getAuction(uint256 auctionId) external view returns (string, address, uint256, address, uint256, bool)",
  "function getPendingReturn(uint256 auctionId, address bidder) external view returns (uint256)",
  "function auctionCount() external view returns (uint256)",
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, string itemName, uint256 startingPrice, uint256 deadline)",
  "event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount)",
  "event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 amount)",
  "event BidWithdrawn(uint256 indexed auctionId, address indexed bidder, uint256 amount)",
];

// ─── Update this after deployment ───
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Default Hardhat first deployment address

// ─── Styles ───
const styles = {
  app: { fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 900, margin: "0 auto", padding: 20, background: "#0a0a0f", minHeight: "100vh", color: "#e0e0e0" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #1e1e2e", marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: "#7c5cfc" },
  connectBtn: { padding: "10px 20px", background: "#7c5cfc", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  walletInfo: { textAlign: "right", fontSize: 13, color: "#888" },
  address: { fontFamily: "monospace", color: "#7c5cfc", fontSize: 13 },
  balance: { color: "#50fa7b", fontWeight: 600 },
  section: { background: "#12121a", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #1e1e2e" },
  sectionTitle: { fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#fff" },
  input: { width: "100%", padding: 10, background: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: 8, color: "#e0e0e0", fontSize: 14, marginBottom: 10, boxSizing: "border-box" },
  row: { display: "flex", gap: 10, marginBottom: 10 },
  btn: { padding: "10px 20px", background: "#7c5cfc", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  btnDanger: { padding: "10px 20px", background: "#ff5555", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  btnSuccess: { padding: "10px 20px", background: "#50fa7b", color: "#000", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  card: { background: "#1a1a2e", borderRadius: 10, padding: 16, marginBottom: 12, border: "1px solid #2a2a3e" },
  status: { padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14, fontWeight: 500 },
  statusSuccess: { background: "#1a3a2a", color: "#50fa7b", border: "1px solid #2a4a3a" },
  statusError: { background: "#3a1a1a", color: "#ff5555", border: "1px solid #4a2a2a" },
  statusPending: { background: "#2a2a1a", color: "#f1fa8c", border: "1px solid #3a3a2a" },
  label: { fontSize: 12, color: "#888", marginBottom: 4, display: "block" },
  value: { fontSize: 14, color: "#e0e0e0", fontWeight: 500 },
  badge: { display: "inline-block", padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 },
  badgeActive: { background: "#1a3a2a", color: "#50fa7b" },
  badgeEnded: { background: "#3a1a1a", color: "#ff5555" },
};

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("");
  const [auctions, setAuctions] = useState([]);
  const [status, setStatus] = useState({ msg: "", type: "" });

  // Form states
  const [itemName, setItemName] = useState("");
  const [startingPrice, setStartingPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [bidAuctionId, setBidAuctionId] = useState("");

  // ─── Connect Wallet ───
  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatus({ msg: "Please install MetaMask or Rabby!", type: "error" });
      return;
    }
    try {
      // Switch to Hardhat network (chain ID 31337 = 0x7A69)
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x7A69" }],
        });
      } catch (switchError) {
        // If chain doesn't exist, add it
        if (switchError.code === 4902 || switchError.message?.includes("Unrecognized")) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x7A69",
              chainName: "Hardhat Local",
              rpcUrls: ["http://127.0.0.1:8545"],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            }],
          });
        }
      }

      try{await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x7A69"}]})}catch(e){await window.ethereum.request({method:"wallet_addEthereumChain",params:[{chainId:"0x7A69",chainName:"Hardhat",rpcUrls:["http://127.0.0.1:8545"],nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18}}]})} const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.send("eth_requestAccounts", []);
      const sign = await prov.getSigner();
      const bal = await prov.getBalance(accounts[0]);
      const cont = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, sign);

      setProvider(prov);
      setSigner(sign);
      setContract(cont);
      setAccount(accounts[0]);
      setBalance(ethers.formatEther(bal));
      setStatus({ msg: `Connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`, type: "success" });

      fetchAuctions(cont);
    } catch (err) {
      setStatus({ msg: `Connection failed: ${err.message}`, type: "error" });
    }
  };

  // ─── Fetch all auctions ───
  const fetchAuctions = useCallback(async (cont) => {
    const c = cont || contract;
    if (!c) return;
    try {
      const count = await c.auctionCount();
      const list = [];
      for (let i = 0; i < Number(count); i++) {
        const [itemName, seller, highestBid, highestBidder, deadline, ended] = await c.getAuction(i);
        let pendingReturn = BigInt(0);
        if (account) {
          pendingReturn = await c.getPendingReturn(i, account);
        }
        list.push({ id: i, itemName, seller, highestBid, highestBidder, deadline: Number(deadline), ended, pendingReturn });
      }
      setAuctions(list);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [contract, account]);

  useEffect(() => {
    if (contract && account) fetchAuctions();
  }, [contract, account, fetchAuctions]);

  // ─── Create Auction ───
  const handleCreateAuction = async (e) => {
    e.preventDefault();
    if (!contract) return;
    try {
      setStatus({ msg: "Creating auction... please confirm in MetaMask", type: "pending" });
      const tx = await contract.createAuction(
        itemName,
        ethers.parseEther(startingPrice),
        parseInt(duration)
      );
      setStatus({ msg: "Transaction submitted, waiting for confirmation...", type: "pending" });
      await tx.wait();
      setStatus({ msg: `Auction created successfully! TX: ${tx.hash.slice(0, 10)}...`, type: "success" });
      setItemName(""); setStartingPrice(""); setDuration("");
      fetchAuctions();
    } catch (err) {
      setStatus({ msg: `Failed: ${err.reason || err.message}`, type: "error" });
    }
  };

  // ─── Place Bid ───
  const handlePlaceBid = async (e) => {
    e.preventDefault();
    if (!contract) return;
    try {
      setStatus({ msg: "Placing bid... please confirm in MetaMask", type: "pending" });
      const tx = await contract.placeBid(parseInt(bidAuctionId), { value: ethers.parseEther(bidAmount) });
      setStatus({ msg: "Bid submitted, waiting for confirmation...", type: "pending" });
      await tx.wait();
      setStatus({ msg: `Bid placed successfully! TX: ${tx.hash.slice(0, 10)}...`, type: "success" });
      setBidAmount(""); setBidAuctionId("");
      fetchAuctions();
      // Update balance
      if (provider) {
        const bal = await provider.getBalance(account);
        setBalance(ethers.formatEther(bal));
      }
    } catch (err) {
      setStatus({ msg: `Bid failed: ${err.reason || err.message}`, type: "error" });
    }
  };

  // ─── End Auction ───
  const handleEndAuction = async (auctionId) => {
    if (!contract) return;
    try {
      setStatus({ msg: "Ending auction...", type: "pending" });
      const tx = await contract.endAuction(auctionId);
      await tx.wait();
      setStatus({ msg: `Auction #${auctionId} ended!`, type: "success" });
      fetchAuctions();
      if (provider) {
        const bal = await provider.getBalance(account);
        setBalance(ethers.formatEther(bal));
      }
    } catch (err) {
      setStatus({ msg: `End failed: ${err.reason || err.message}`, type: "error" });
    }
  };

  // ─── Withdraw Bid ───
  const handleWithdraw = async (auctionId) => {
    if (!contract) return;
    try {
      setStatus({ msg: "Withdrawing bid...", type: "pending" });
      const tx = await contract.withdrawBid(auctionId);
      await tx.wait();
      setStatus({ msg: `Bid withdrawn from auction #${auctionId}!`, type: "success" });
      fetchAuctions();
      if (provider) {
        const bal = await provider.getBalance(account);
        setBalance(ethers.formatEther(bal));
      }
    } catch (err) {
      setStatus({ msg: `Withdraw failed: ${err.reason || err.message}`, type: "error" });
    }
  };

  // ─── Time helpers ───
  const formatDeadline = (ts) => {
    const d = new Date(ts * 1000);
    return d.toLocaleString();
  };

  const isExpired = (deadline) => Date.now() / 1000 >= deadline;

  // ─── Render ───
  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>⚡ CS218 Auction DApp</div>
        {!account ? (
          <button style={styles.connectBtn} onClick={connectWallet}>Connect Wallet</button>
        ) : (
          <div style={styles.walletInfo}>
            <div style={styles.address}>{account.slice(0, 6)}...{account.slice(-4)}</div>
            <div style={styles.balance}>{parseFloat(balance).toFixed(4)} ETH</div>
          </div>
        )}
      </div>

      {/* Status */}
      {status.msg && (
        <div style={{
          ...styles.status,
          ...(status.type === "success" ? styles.statusSuccess :
            status.type === "error" ? styles.statusError : styles.statusPending)
        }}>
          {status.type === "pending" ? "⏳ " : status.type === "success" ? "✓ " : "✗ "}
          {status.msg}
        </div>
      )}

      {!account ? (
        <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Connect your wallet to get started</div>
          <div style={{ fontSize: 13 }}>Make sure Hardhat node is running on localhost:8545</div>
        </div>
      ) : (
        <>
          {/* Create Auction */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>📦 Create Auction</div>
            <input style={styles.input} placeholder="Item name (e.g. Vintage Watch)" value={itemName} onChange={(e) => setItemName(e.target.value)} />
            <div style={styles.row}>
              <input style={{ ...styles.input, flex: 1 }} placeholder="Starting price (ETH)" value={startingPrice} onChange={(e) => setStartingPrice(e.target.value)} />
              <input style={{ ...styles.input, flex: 1 }} placeholder="Duration (seconds)" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <button style={styles.btn} onClick={handleCreateAuction}>Create Auction</button>
          </div>

          {/* Place Bid */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>💰 Place Bid</div>
            <div style={styles.row}>
              <input style={{ ...styles.input, flex: 1 }} placeholder="Auction ID" value={bidAuctionId} onChange={(e) => setBidAuctionId(e.target.value)} />
              <input style={{ ...styles.input, flex: 1 }} placeholder="Bid amount (ETH)" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} />
            </div>
            <button style={styles.btn} onClick={handlePlaceBid}>Place Bid</button>
          </div>

          {/* Auction List */}
          <div style={styles.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={styles.sectionTitle}>📋 Auctions ({auctions.length})</div>
              <button style={{ ...styles.btn, padding: "6px 14px", fontSize: 12 }} onClick={() => fetchAuctions()}>Refresh</button>
            </div>

            {auctions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "#666" }}>No auctions yet. Create one above!</div>
            ) : (
              auctions.map((a) => (
                <div key={a.id} style={styles.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>
                      #{a.id} — {a.itemName}
                    </div>
                    <span style={{ ...styles.badge, ...(a.ended ? styles.badgeEnded : styles.badgeActive) }}>
                      {a.ended ? "ENDED" : isExpired(a.deadline) ? "EXPIRED" : "ACTIVE"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                    <div><span style={styles.label}>Seller</span><span style={{ ...styles.value, fontFamily: "monospace", fontSize: 12 }}>{a.seller.slice(0, 8)}...{a.seller.slice(-6)}</span></div>
                    <div><span style={styles.label}>Highest Bid</span><span style={styles.value}>{ethers.formatEther(a.highestBid)} ETH</span></div>
                    <div><span style={styles.label}>Highest Bidder</span><span style={{ ...styles.value, fontFamily: "monospace", fontSize: 12 }}>{a.highestBidder === ethers.ZeroAddress ? "None" : `${a.highestBidder.slice(0, 8)}...`}</span></div>
                    <div><span style={styles.label}>Deadline</span><span style={styles.value}>{formatDeadline(a.deadline)}</span></div>
                  </div>

                  {a.pendingReturn > 0n && (
                    <div style={{ background: "#2a2a1a", padding: 8, borderRadius: 6, marginBottom: 10, fontSize: 13, color: "#f1fa8c" }}>
                      You have {ethers.formatEther(a.pendingReturn)} ETH available to withdraw
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    {!a.ended && isExpired(a.deadline) && (
                      <button style={styles.btnDanger} onClick={() => handleEndAuction(a.id)}>End Auction</button>
                    )}
                    {a.pendingReturn > 0n && (
                      <button style={styles.btnSuccess} onClick={() => handleWithdraw(a.id)}>Withdraw Bid</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <div style={{ textAlign: "center", padding: 16, fontSize: 12, color: "#444" }}>
        CS218 — Programmable & Interoperable Blockchain · Decentralised Auction System
      </div>
    </div>
  );
}

export default App;
