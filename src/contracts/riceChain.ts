import type { InterfaceAbi } from 'ethers'

export const SEPOLIA_CHAIN_ID = 11155111n
export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7'

export const RICECHAIN_ABI = [
  {
    type: 'function',
    name: 'productCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'registerProduct',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'productName', type: 'string' },
      { name: 'batchCode', type: 'string' },
      { name: 'origin', type: 'string' },
      { name: 'metadata', type: 'string' },
    ],
    outputs: [{ name: 'productId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'registerOrUpdateParticipant',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'role', type: 'string' },
      { name: 'contact', type: 'string' },
      { name: 'organization', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferOwnership',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'productId', type: 'uint256' },
      { name: 'receiverAddress', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'assignShipment',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'productId', type: 'uint256' },
      { name: 'transporterAddress', type: 'address' },
      { name: 'vendorAddress', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateShipment',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'productId', type: 'uint256' },
      { name: 'status', type: 'string' },
      { name: 'location', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'confirmDelivery',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'productId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getProduct',
    stateMutability: 'view',
    inputs: [{ name: 'productId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'productName', type: 'string' },
          { name: 'batchCode', type: 'string' },
          { name: 'origin', type: 'string' },
          { name: 'metadata', type: 'string' },
          { name: 'farmer', type: 'address' },
          { name: 'currentOwner', type: 'address' },
          { name: 'assignedTransporter', type: 'address' },
          { name: 'assignedVendor', type: 'address' },
          { name: 'currentStatus', type: 'string' },
          { name: 'currentLocation', type: 'string' },
          { name: 'registeredAt', type: 'uint256' },
          { name: 'statusUpdatedAt', type: 'uint256' },
          { name: 'delivered', type: 'bool' },
          { name: 'exists', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getHistory',
    stateMutability: 'view',
    inputs: [{ name: 'productId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'action', type: 'string' },
          { name: 'actor', type: 'address' },
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'status', type: 'string' },
          { name: 'location', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getParticipant',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'role', type: 'string' },
          { name: 'contact', type: 'string' },
          { name: 'organization', type: 'string' },
          { name: 'registeredAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'exists', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'event',
    name: 'ParticipantRegistered',
    anonymous: false,
    inputs: [
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'role', type: 'string', indexed: false },
      { name: 'organization', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ParticipantUpdated',
    anonymous: false,
    inputs: [
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'role', type: 'string', indexed: false },
      { name: 'organization', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TraceEventRecorded',
    anonymous: false,
    inputs: [
      { name: 'productId', type: 'uint256', indexed: true },
      { name: 'action', type: 'string', indexed: false },
      { name: 'actor', type: 'address', indexed: true },
      { name: 'from', type: 'address', indexed: false },
      { name: 'to', type: 'address', indexed: false },
      { name: 'status', type: 'string', indexed: false },
      { name: 'location', type: 'string', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const satisfies InterfaceAbi
