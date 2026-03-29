export const MemoryVaultABI = [
  {
    type: "function",
    name: "addMemory",
    stateMutability: "nonpayable",
    inputs: [{ name: "cid", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getMemories",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "string[]" }],
  },
] as const;

export const PremiumSBTABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "isPremium",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const PaymasterABI = [
  {
    type: "function",
    name: "getDeposit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
