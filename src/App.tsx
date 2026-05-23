import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { BrowserProvider, Contract, isAddress } from 'ethers'
import {
  FaChevronDown,
  FaCircleCheck,
  FaEthereum,
  FaIdBadge,
  FaRotate,
  FaSeedling,
  FaTruck,
  FaWallet,
  FaXmark,
} from 'react-icons/fa6'
import {
  RICECHAIN_ABI,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
} from './contracts/riceChain'
import './App.css'

type EthereumProvider = {
  isMetaMask?: boolean
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: (...args: string[]) => void) => void
  removeListener?: (event: string, listener: (...args: string[]) => void) => void
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

type WalletState = {
  address: string
  chainId: bigint | null
}

type Product = {
  id: bigint
  productName: string
  batchCode: string
  origin: string
  metadata: string
  farmer: string
  currentOwner: string
  assignedTransporter: string
  assignedVendor: string
  currentStatus: string
  currentLocation: string
  registeredAt: bigint
  statusUpdatedAt: bigint
  delivered: boolean
}

type Participant = {
  name: string
  role: string
  contact: string
  organization: string
  registeredAt: bigint
  updatedAt: bigint
  exists: boolean
}

type TraceEvent = {
  productId: bigint
  action: string
  actor: string
  from: string
  to: string
  status: string
  location: string
  timestamp: bigint
  transactionHash?: string
}

type DecodedTraceLog = {
  args: {
    productId: bigint
    action: string
    actor: string
    from: string
    to: string
    status: string
    location: string
    timestamp: bigint
  }
  transactionHash: string
}

type HistoryResult = {
  action: string
  actor: string
  from: string
  to: string
  status: string
  location: string
  timestamp: bigint
}

type ProductResult = Product & {
  exists: boolean
}

type ParticipantResult = Participant

const contractAddress = import.meta.env.VITE_RICECHAIN_CONTRACT_ADDRESS as string | undefined
const deployBlock = Number(import.meta.env.VITE_RICECHAIN_DEPLOY_BLOCK ?? 0)
const zeroAddress = '0x0000000000000000000000000000000000000000'
const participantRoles = ['Farmer', 'Trader', 'Transporter', 'Vendor'] as const
const readyForVendorStatus = 'Ready for vendor confirmation'

const initialProductForm = {
  productName: '',
  batchCode: '',
  origin: '',
  metadata: '',
}

const initialParticipantForm = {
  name: '',
  role: 'Farmer',
  contact: '',
  organization: '',
}

const initialTransferForm = {
  receiverAddress: '',
}

const initialAssignmentForm = {
  transporterAddress: '',
  vendorAddress: '',
}

const initialShipmentForm = {
  status: '',
  location: '',
}

const shipmentStatuses = [
  'Picked up',
  'In transit',
  'Delayed',
  'Arrived at market',
  readyForVendorStatus,
] as const

type ProductAction = 'transfer' | 'assign' | 'update' | 'confirm'
type Toast = {
  id: string
  type: 'success' | 'error'
  text: string
}

function formatAddress(address: string) {
  if (!address) return 'Not connected'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatDate(timestamp: bigint) {
  if (timestamp === 0n) return 'Pending'
  return new Date(Number(timestamp) * 1000).toLocaleString()
}

function normalizeAddress(address: string) {
  return address.toLowerCase()
}

function normalizeError(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: number; shortMessage?: string; reason?: string; message?: string }

    if (candidate.code === 4001) {
      return 'MetaMask request rejected by the user.'
    }

    return candidate.shortMessage ?? candidate.reason ?? candidate.message ?? 'Transaction failed.'
  }

  return 'Transaction failed.'
}

function productFromResult(result: ProductResult): Product {
  return {
    id: result.id,
    productName: result.productName,
    batchCode: result.batchCode,
    origin: result.origin,
    metadata: result.metadata,
    farmer: result.farmer,
    currentOwner: result.currentOwner,
    assignedTransporter: result.assignedTransporter,
    assignedVendor: result.assignedVendor,
    currentStatus: result.currentStatus,
    currentLocation: result.currentLocation,
    registeredAt: result.registeredAt,
    statusUpdatedAt: result.statusUpdatedAt,
    delivered: result.delivered,
  }
}

function participantFromResult(result: ParticipantResult): Participant {
  return {
    name: result.name,
    role: result.role,
    contact: result.contact,
    organization: result.organization,
    registeredAt: result.registeredAt,
    updatedAt: result.updatedAt,
    exists: result.exists,
  }
}

function participantFormFromProfile(profile: Participant) {
  return {
    name: profile.name,
    role: profile.role || 'Farmer',
    contact: profile.contact,
    organization: profile.organization,
  }
}

function App() {
  const [wallet, setWallet] = useState<WalletState>({ address: '', chainId: null })
  const [products, setProducts] = useState<Product[]>([])
  const [history, setHistory] = useState<TraceEvent[]>([])
  const [productHistories, setProductHistories] = useState<Record<string, TraceEvent[]>>({})
  const [participantProfile, setParticipantProfile] = useState<Participant | null>(null)
  const [participantCache, setParticipantCache] = useState<Record<string, Participant>>({})
  const [participantForm, setParticipantForm] = useState(initialParticipantForm)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [modalProductId, setModalProductId] = useState('')
  const [productForm, setProductForm] = useState(initialProductForm)
  const [transferForm, setTransferForm] = useState(initialTransferForm)
  const [assignmentForm, setAssignmentForm] = useState(initialAssignmentForm)
  const [shipmentForm, setShipmentForm] = useState(initialShipmentForm)
  const [activeProductAction, setActiveProductAction] = useState<ProductAction | null>(null)
  const [selectedTraceEventIndex, setSelectedTraceEventIndex] = useState<number | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastTimeouts = useRef<Record<string, number>>({})
  const [pendingAction, setPendingAction] = useState('')
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false) // new state

  const dismissToast = useCallback((id: string) => {
    window.clearTimeout(toastTimeouts.current[id])
    delete toastTimeouts.current[id]
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((type: Toast['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    setToasts((current) => [...current, { id, type, text }])
    toastTimeouts.current[id] = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      delete toastTimeouts.current[id]
    }, 3000)
  }, [])

  const showSuccessToast = useCallback((text: string) => showToast('success', text), [showToast])
  const showErrorToast = useCallback((text: string) => showToast('error', text), [showToast])

  const isConnected = Boolean(wallet.address)
  const isSepolia = wallet.chainId === SEPOLIA_CHAIN_ID
  const walletAddress = normalizeAddress(wallet.address)
  const modalProduct = useMemo(
    () => products.find((product) => product.id.toString() === modalProductId),
    [modalProductId, products],
  )
  const participantAddresses = useMemo(() => {
    const addresses = new Set<string>()

    products.forEach((product) => {
      addresses.add(product.farmer)
      addresses.add(product.currentOwner)
      addresses.add(product.assignedTransporter)
      addresses.add(product.assignedVendor)
    })

    Object.values(productHistories).forEach((entries) => {
      entries.forEach((event) => {
        addresses.add(event.actor)
        addresses.add(event.from)
        addresses.add(event.to)
      })
    })

    return Array.from(addresses).filter((address) => address && address !== zeroAddress)
  }, [productHistories, products])
  const hasParticipantProfile = Boolean(participantProfile?.exists)
  const profileDisplayName = participantProfile?.exists
    ? `${participantProfile.name} - ${participantProfile.role}`
    : 'Create participant profile'
  const workspaceReady = isConnected && isSepolia && hasParticipantProfile
  const roleProductGroups = useMemo(() => {
    const wasTouchedByWallet = (product: Product) => {
      const entries = productHistories[product.id.toString()] ?? []

      return entries.some((event) =>
        [event.actor, event.from, event.to].some((address) => normalizeAddress(address) === walletAddress),
      )
    }

    return {
      farmerProducts: products.filter((product) => normalizeAddress(product.farmer) === walletAddress),
      traderStock: products.filter(
        (product) => normalizeAddress(product.currentOwner) === walletAddress && !product.delivered,
      ),
      traderCompletedSales: products.filter((product) => product.delivered && wasTouchedByWallet(product)),
      transporterAssigned: products.filter(
        (product) => normalizeAddress(product.assignedTransporter) === walletAddress && !product.delivered,
      ),
      transporterCompleted: products.filter(
        (product) => normalizeAddress(product.assignedTransporter) === walletAddress && product.delivered,
      ),
      vendorIncoming: products.filter(
        (product) => normalizeAddress(product.assignedVendor) === walletAddress && !product.delivered,
      ),
      vendorReceived: products.filter(
        (product) => normalizeAddress(product.assignedVendor) === walletAddress && product.delivered,
      ),
    }
  }, [productHistories, products, walletAddress])

  const getProvider = useCallback(() => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed. Install MetaMask to connect a wallet.')
    }

    return new BrowserProvider(window.ethereum)
  }, [])

  const getContract = useCallback(async (write = false) => {
    if (!contractAddress) {
      throw new Error('Set VITE_RICECHAIN_CONTRACT_ADDRESS after deploying the contract.')
    }

    const provider = getProvider()

    if (!write) {
      return new Contract(contractAddress, RICECHAIN_ABI, provider)
    }

    const network = await provider.getNetwork()
    if (network.chainId !== SEPOLIA_CHAIN_ID) {
      throw new Error('Switch MetaMask to Sepolia before sending a RiceChain transaction.')
    }

    const signer = await provider.getSigner()
    return new Contract(contractAddress, RICECHAIN_ABI, signer)
  }, [getProvider])

  const profileLabelFor = useCallback((address: string) => {
    if (!address || address === zeroAddress) return 'None'

    const profile = participantCache[address.toLowerCase()]
    if (!profile?.exists) return formatAddress(address)

    return `${profile.name} (${profile.role}) - ${formatAddress(address)}`
  }, [participantCache])

  const loadParticipant = useCallback(async (address: string) => {
    if (!window.ethereum || !contractAddress || !address || address === zeroAddress) return null

    const contract = await getContract()
    const participant = participantFromResult((await contract.getParticipant(address)) as ParticipantResult)

    setParticipantCache((current) => ({
      ...current,
      [address.toLowerCase()]: participant,
    }))

    return participant
  }, [getContract])

  const readHistoryForProduct = useCallback(async (contract: Contract, productId: string) => {
    const parsedProductId = BigInt(productId)
    const entries = (await contract.getHistory(parsedProductId)) as HistoryResult[]
    let traceLogs: TraceEvent[] = []

    try {
      const filter = contract.filters.TraceEventRecorded(parsedProductId)
      const logs = await contract.queryFilter(filter, deployBlock, 'latest')

      traceLogs = logs
        .filter((log) => 'args' in log)
        .map((log) => {
          const decoded = log as unknown as DecodedTraceLog

          return {
            productId: decoded.args.productId,
            action: decoded.args.action,
            actor: decoded.args.actor,
            from: decoded.args.from,
            to: decoded.args.to,
            status: decoded.args.status,
            location: decoded.args.location,
            timestamp: decoded.args.timestamp,
            transactionHash: decoded.transactionHash,
          }
        })
    } catch {
      traceLogs = []
    }

    return entries.map((entry, index) => ({
      productId: parsedProductId,
      action: entry.action,
      actor: entry.actor,
      from: entry.from,
      to: entry.to,
      status: entry.status,
      location: entry.location,
      timestamp: entry.timestamp,
      transactionHash: traceLogs[index]?.transactionHash,
    }))
  }, [])

  const refreshParticipantProfile = useCallback(async (address: string) => {
    if (!address) {
      setParticipantProfile(null)
      setParticipantForm(initialParticipantForm)
      return
    }

    const participant = await loadParticipant(address)

    if (participant?.exists) {
      setParticipantProfile(participant)
      setParticipantForm(participantFormFromProfile(participant))
      return
    }

    setParticipantProfile(null)
    setParticipantForm(initialParticipantForm)
  }, [loadParticipant])

  const refreshWallet = useCallback(async () => {
    if (!window.ethereum) return

    const provider = getProvider()
    const accounts = (await provider.send('eth_accounts', [])) as string[]
    const network = await provider.getNetwork()

    setWallet({
      address: accounts[0] ?? '',
      chainId: network.chainId,
    })
  }, [getProvider])

  const refreshProducts = useCallback(async () => {
    if (!window.ethereum || !contractAddress) return

    const contract = await getContract()
    const count = (await contract.productCount()) as bigint
    const nextProducts: Product[] = []

    try {
      for (let id = 1n; id <= count; id += 1n) {
        const product = (await contract.getProduct(id)) as ProductResult
        nextProducts.push(productFromResult(product))
      }
    } catch (caught) {
      throw new Error(
        `Could not decode products from RiceChain at ${contractAddress}. Confirm this exact address is the newly deployed contract, restart the Vite dev server after changing .env, and make sure Remix compiled the updated RiceChain.sol before deployment.`,
        { cause: caught },
      )
    }

    setProducts(nextProducts)

    const nextHistories: Record<string, TraceEvent[]> = {}
    await Promise.all(
      nextProducts.map(async (product) => {
        const id = product.id.toString()
        nextHistories[id] = await readHistoryForProduct(contract, id)
      }),
    )
    setProductHistories(nextHistories)

    if (nextProducts.length === 0) {
      setHistory([])
    } else if (!selectedProductId) {
      setSelectedProductId(nextProducts[nextProducts.length - 1].id.toString())
    } else if (selectedProductId) {
      setHistory(nextHistories[selectedProductId] ?? [])
    }
  }, [getContract, readHistoryForProduct, selectedProductId])

  const refreshHistoryForProduct = useCallback(async (productId: string) => {
    if (!window.ethereum || !contractAddress || !productId) {
      setHistory([])
      return
    }

    const contract = await getContract()
    const entries = await readHistoryForProduct(contract, productId)
    setProductHistories((current) => ({ ...current, [productId]: entries }))
    setHistory(entries)
    setSelectedProductId(productId)
  }, [getContract, readHistoryForProduct])

  const refreshHistory = useCallback(async () => {
    await refreshHistoryForProduct(selectedProductId)
  }, [refreshHistoryForProduct, selectedProductId])

  const refreshAll = useCallback(async () => {
    await refreshWallet()
    await refreshProducts()
    await refreshHistory()
  }, [refreshHistory, refreshProducts, refreshWallet])

  useEffect(() => {
    void refreshWallet()
  }, [refreshWallet])

  useEffect(() => {
    void refreshParticipantProfile(wallet.address).catch((caught) => showErrorToast(normalizeError(caught)))
  }, [refreshParticipantProfile, showErrorToast, wallet.address])

  useEffect(() => {
    void refreshProducts().catch((caught) => showErrorToast(normalizeError(caught)))
  }, [refreshProducts, showErrorToast])

  useEffect(() => {
    void refreshHistory().catch((caught) => showErrorToast(normalizeError(caught)))
  }, [refreshHistory, showErrorToast])

  useEffect(() => {
    participantAddresses.forEach((address) => {
      if (!participantCache[address.toLowerCase()]) {
        void loadParticipant(address).catch((caught) => showErrorToast(normalizeError(caught)))
      }
    })
  }, [loadParticipant, participantAddresses, participantCache, showErrorToast])

  useEffect(() => {
    const handleAccountsChanged = () => {
      void refreshAll()
    }
    const handleChainChanged = () => {
      void refreshAll()
    }

    window.ethereum?.on?.('accountsChanged', handleAccountsChanged)
    window.ethereum?.on?.('chainChanged', handleChainChanged)

    return () => {
      window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged)
      window.ethereum?.removeListener?.('chainChanged', handleChainChanged)
    }
  }, [refreshAll])

  useEffect(() => () => {
    Object.values(toastTimeouts.current).forEach((timeout) => window.clearTimeout(timeout))
  }, [])

  function openProduct(productId: bigint) {
    const id = productId.toString()
    setSelectedProductId(id)
    setModalProductId(id)
    setHistory(productHistories[id] ?? [])
    setActiveProductAction(null)
    setSelectedTraceEventIndex(null)
    setTransferForm(initialTransferForm)
    setAssignmentForm(initialAssignmentForm)
    setShipmentForm(initialShipmentForm)
  }

  function closeProductModal() {
    setModalProductId('')
    setActiveProductAction(null)
    setSelectedTraceEventIndex(null)
    setTransferForm(initialTransferForm)
    setAssignmentForm(initialAssignmentForm)
    setShipmentForm(initialShipmentForm)
  }

  function closeProductActionModal() {
    setActiveProductAction(null)
    setTransferForm(initialTransferForm)
    setAssignmentForm(initialAssignmentForm)
    setShipmentForm(initialShipmentForm)
  }

  function closeTraceEventModal() {
    setSelectedTraceEventIndex(null)
  }

  async function connectWallet() {
    try {
      const provider = getProvider()
      const accounts = (await provider.send('eth_requestAccounts', [])) as string[]
      const network = await provider.getNetwork()

      setWallet({
        address: accounts[0] ?? '',
        chainId: network.chainId,
      })
      showSuccessToast('MetaMask wallet connected.')
      await refreshProducts()
    } catch (caught) {
      showErrorToast(normalizeError(caught))
    }
  }

  // new disconnect function
  function disconnectWallet() {
    setWallet({ address: '', chainId: null })
    setParticipantProfile(null)
    setParticipantForm(initialParticipantForm)
    setProducts([])
    setHistory([])
    setProductHistories({})
    setSelectedProductId('')
    setModalProductId('')
    setActiveProductAction(null)
    setSelectedTraceEventIndex(null)
    setIsProfileOpen(false)
    setIsParticipantModalOpen(false)
    showSuccessToast('Wallet disconnected.')
  }

  async function switchToSepolia() {
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask is not installed.')
      }

      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      })
      await refreshWallet()
    } catch (caught) {
      showErrorToast(normalizeError(caught))
    }
  }

  async function saveParticipantProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const succeeded = await runTransaction('Participant profile', (contract) =>
      contract.registerOrUpdateParticipant(
        participantForm.name,
        participantForm.role,
        participantForm.contact,
        participantForm.organization,
      ),
    )

    if (succeeded && wallet.address) {
      await refreshParticipantProfile(wallet.address)
      setIsParticipantModalOpen(false) // close modal after success
    }
  }

  async function runTransaction(
    label: string,
    action: (contract: Contract) => Promise<{ hash: string; wait: () => Promise<unknown> }>,
    productId?: bigint,
  ) {
    try {
      setPendingAction(label)

      const contract = await getContract(true)
      const tx = await action(contract)
      showSuccessToast(`${label} submitted: ${tx.hash}`)
      await tx.wait()
      showSuccessToast(`${label} confirmed: ${tx.hash}`)
      await refreshProducts()
      if (productId) {
        await refreshHistoryForProduct(productId.toString())
      } else {
        await refreshHistory()
      }
      return true
    } catch (caught) {
      showErrorToast(normalizeError(caught))
      return false
    } finally {
      setPendingAction('')
    }
  }

  async function registerProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const succeeded = await runTransaction('Product registration', (contract) =>
      contract.registerProduct(
        productForm.productName,
        productForm.batchCode,
        productForm.origin,
        productForm.metadata,
      ),
    )
    if (succeeded) setProductForm(initialProductForm)
  }

  async function transferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!modalProduct) {
      showErrorToast('Select a product to transfer.')
      return
    }

    if (!isAddress(transferForm.receiverAddress)) {
      showErrorToast('Enter a valid trader wallet address.')
      return
    }

    const succeeded = await runTransaction('Ownership transfer', (contract) =>
      contract.transferOwnership(modalProduct.id, transferForm.receiverAddress),
      modalProduct.id,
    )
    if (succeeded) {
      setTransferForm(initialTransferForm)
      setActiveProductAction(null)
    }
  }

  async function assignShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!modalProduct) {
      showErrorToast('Select a product to assign.')
      return
    }

    if (!isAddress(assignmentForm.transporterAddress)) {
      showErrorToast('Enter a valid transporter wallet address.')
      return
    }

    if (!isAddress(assignmentForm.vendorAddress)) {
      showErrorToast('Enter a valid vendor wallet address.')
      return
    }

    const succeeded = await runTransaction('Shipment assignment', (contract) =>
      contract.assignShipment(
        modalProduct.id,
        assignmentForm.transporterAddress,
        assignmentForm.vendorAddress,
      ),
      modalProduct.id,
    )
    if (succeeded) {
      setAssignmentForm(initialAssignmentForm)
      setActiveProductAction(null)
    }
  }

  async function updateShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!modalProduct) {
      showErrorToast('Select a shipment to update.')
      return
    }

    const succeeded = await runTransaction('Shipment update', (contract) =>
      contract.updateShipment(
        modalProduct.id,
        shipmentForm.status,
        shipmentForm.location,
      ),
      modalProduct.id,
    )
    if (succeeded) {
      setShipmentForm(initialShipmentForm)
      setActiveProductAction(null)
    }
  }

  async function confirmDelivery() {
    if (!modalProduct) {
      showErrorToast('Select a product to confirm.')
      return
    }

    const succeeded = await runTransaction(
      'Delivery confirmation',
      (contract) => contract.confirmDelivery(modalProduct.id),
      modalProduct.id,
    )
    if (succeeded) setActiveProductAction(null)
  }

  const renderParticipantProfileForm = (className = 'profile-form') => (
    <form className={className} onSubmit={saveParticipantProfile}>
      <label>
        Name
        <input
          required
          value={participantForm.name}
          onChange={(event) => setParticipantForm({ ...participantForm, name: event.target.value })}
          placeholder="Carlo Bernardo"
        />
      </label>
      <label>
        Role
        <select
          value={participantForm.role}
          onChange={(event) => setParticipantForm({ ...participantForm, role: event.target.value })}
        >
          {participantRoles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>
      <label>
        Contact
        <input
          value={participantForm.contact}
          onChange={(event) => setParticipantForm({ ...participantForm, contact: event.target.value })}
          placeholder="09171234567"
        />
      </label>
      <label>
        Organization
        <input
          value={participantForm.organization}
          onChange={(event) =>
            setParticipantForm({ ...participantForm, organization: event.target.value })
          }
          placeholder="Nueva Ecija Farm Cooperative"
        />
      </label>
      <button disabled={!isConnected || !isSepolia || !contractAddress || Boolean(pendingAction)} type="submit">
        Save participant profile
      </button>
    </form>
  )

  const renderRegisterProductForm = () => (
    <form className="action-card register-panel" onSubmit={registerProduct}>
      <div className="card-heading">
        <FaSeedling aria-hidden="true" />
        <div>
          <p className="eyebrow">Farmer workspace</p>
          <h2>Register product</h2>
        </div>
      </div>
      <label>
        Product name
        <input
          required
          value={productForm.productName}
          onChange={(event) => setProductForm({ ...productForm, productName: event.target.value })}
          placeholder="Jasmine Rice"
        />
      </label>
      <label>
        Batch code
        <input
          required
          value={productForm.batchCode}
          onChange={(event) => setProductForm({ ...productForm, batchCode: event.target.value })}
          placeholder="BATCH-001"
        />
      </label>
      <label>
        Origin
        <input
          value={productForm.origin}
          onChange={(event) => setProductForm({ ...productForm, origin: event.target.value })}
          placeholder="Nueva Ecija"
        />
      </label>
      <label>
        Metadata
        <textarea
          value={productForm.metadata}
          onChange={(event) => setProductForm({ ...productForm, metadata: event.target.value })}
          placeholder="Variety, weight, harvest details"
        />
      </label>
      <button disabled={!workspaceReady || !contractAddress || Boolean(pendingAction)} type="submit">
        Register on-chain
      </button>
    </form>
  )

  const renderProductList = (items: Product[], emptyMessage: string) => (
    <div className="role-product-list">
      {items.length === 0 ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : (
        items.map((product) => (
          <button
            className="product-row"
            key={product.id.toString()}
            type="button"
            onClick={() => openProduct(product.id)}
          >
            <span>#{product.id.toString()} {product.productName}</span>
            <small>{product.currentStatus || (product.delivered ? 'Delivered' : 'Active custody')}</small>
          </button>
        ))
      )}
    </div>
  )

  const renderProductSection = (
    eyebrow: string,
    title: string,
    icon: ReactNode,
    items: Product[],
    emptyMessage: string,
  ) => (
    <section className="list-panel">
      <div className="card-heading">
        {icon}
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {renderProductList(items, emptyMessage)}
    </section>
  )

  const getProductAction = (product: Product): { action: ProductAction; label: string; title: string } | null => {
    const ownsProduct = normalizeAddress(product.currentOwner) === walletAddress
    const isAssignedTransporter = normalizeAddress(product.assignedTransporter) === walletAddress
    const isAssignedVendor = normalizeAddress(product.assignedVendor) === walletAddress

    if (participantProfile?.role === 'Farmer' && ownsProduct && !product.delivered) {
      return { action: 'transfer', label: 'Transfer ownership', title: 'Transfer to Trader' }
    }

    if (participantProfile?.role === 'Trader' && ownsProduct && !product.delivered) {
      return { action: 'assign', label: 'Assign shipment', title: 'Assign shipment' }
    }

    if (participantProfile?.role === 'Transporter' && isAssignedTransporter && !product.delivered) {
      return { action: 'update', label: 'Update status', title: 'Update shipment' }
    }

    if (participantProfile?.role === 'Vendor' && isAssignedVendor && !product.delivered) {
      return { action: 'confirm', label: 'Confirm delivery', title: 'Confirm receipt' }
    }

    return null
  }

  const renderProductSummary = (product: Product) => {
    const productAction = getProductAction(product)

    return (
      <article className="product-summary">
        <div className="product-summary-header">
          <h3>{product.productName}</h3>
          {productAction ? (
            <button type="button" onClick={() => setActiveProductAction(productAction.action)}>
              {productAction.label}
            </button>
          ) : null}
        </div>
        <dl>
          <div>
            <dt>Batch</dt>
            <dd>{product.batchCode}</dd>
          </div>
          <div>
            <dt>Origin</dt>
            <dd>{product.origin || 'None'}</dd>
          </div>
          <div>
            <dt>Metadata</dt>
            <dd>{product.metadata || 'None'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{product.currentStatus || 'None'}</dd>
          </div>
          <div>
            <dt>Current location</dt>
            <dd>{product.currentLocation || 'None'}</dd>
          </div>
          <div>
            <dt>Current owner</dt>
            <dd>{profileLabelFor(product.currentOwner)}</dd>
          </div>
          <div>
            <dt>Transporter</dt>
            <dd>{profileLabelFor(product.assignedTransporter)}</dd>
          </div>
          <div>
            <dt>Vendor</dt>
            <dd>{profileLabelFor(product.assignedVendor)}</dd>
          </div>
          <div>
            <dt>Farmer</dt>
            <dd>{profileLabelFor(product.farmer)}</dd>
          </div>
          <div>
            <dt>Registered</dt>
            <dd>{formatDate(product.registeredAt)}</dd>
          </div>
          <div>
            <dt>Status updated</dt>
            <dd>{formatDate(product.statusUpdatedAt)}</dd>
          </div>
        </dl>
      </article>
    )
  }

  const renderHistory = () => (
    <div className="event-list">
      {history.length === 0 ? (
        <p className="empty-state">
          {selectedProductId
            ? 'No traceability records found for this product yet.'
            : 'Select a product to view blockchain trace events.'}
        </p>
      ) : (
        history.map((event, index) => (
          <button
            className="event-row"
            key={`${event.productId}-${event.timestamp}-${event.action}-${index}`}
            type="button"
            onClick={() => setSelectedTraceEventIndex(index)}
          >
            <span>
              <strong>{event.action}</strong>
              <span>{formatDate(event.timestamp)}</span>
            </span>
          </button>
        ))
      )}
    </div>
  )

  const renderTraceEventModal = () => {
    if (selectedTraceEventIndex === null) return null

    const event = history[selectedTraceEventIndex]
    if (!event) return null

    return (
      <div className="modal-backdrop trace-event-backdrop" role="presentation" onMouseDown={closeTraceEventModal}>
        <section
          aria-modal="true"
          className="product-modal trace-event-modal"
          role="dialog"
          onMouseDown={(modalEvent) => modalEvent.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <p className="eyebrow">Audit event</p>
              <h2>{event.action}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={closeTraceEventModal}
              title="Close audit event"
            >
              <FaXmark aria-hidden="true" />
            </button>
          </div>
          <div className="trace-event-modal-body">
            <dl>
              <div>
                <dt>Product ID</dt>
                <dd>#{event.productId.toString()}</dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>{profileLabelFor(event.actor)}</dd>
              </div>
              <div>
                <dt>From</dt>
                <dd>{profileLabelFor(event.from)}</dd>
              </div>
              <div>
                <dt>To</dt>
                <dd>{profileLabelFor(event.to)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{event.status || 'None'}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{event.location || 'None'}</dd>
              </div>
              <div>
                <dt>Timestamp</dt>
                <dd>{formatDate(event.timestamp)}</dd>
              </div>
              <div>
                <dt>Tx hash</dt>
                <dd>
                  {event.transactionHash ? (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${event.transactionHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {formatAddress(event.transactionHash)}
                    </a>
                  ) : (
                    'Recorded on-chain'
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    )
  }

  const renderProductActionForm = (product: Product) => {
    const isReadyForVendor = product.currentStatus === readyForVendorStatus

    if (activeProductAction === 'transfer') {
      return (
        <form className="modal-action-form" onSubmit={transferOwnership}>
          <label>
            Trader wallet address
            <input
              required
              value={transferForm.receiverAddress}
              onChange={(event) => setTransferForm({ receiverAddress: event.target.value })}
              placeholder="0x..."
            />
          </label>
          <button disabled={!workspaceReady || !contractAddress || Boolean(pendingAction)} type="submit">
            Transfer ownership
          </button>
        </form>
      )
    }

    if (activeProductAction === 'assign') {
      return (
        <form className="modal-action-form" onSubmit={assignShipment}>
          <label>
            Transporter wallet address
            <input
              required
              value={assignmentForm.transporterAddress}
              onChange={(event) =>
                setAssignmentForm({ ...assignmentForm, transporterAddress: event.target.value })
              }
              placeholder="0x..."
            />
          </label>
          <label>
            Vendor wallet address
            <input
              required
              value={assignmentForm.vendorAddress}
              onChange={(event) =>
                setAssignmentForm({ ...assignmentForm, vendorAddress: event.target.value })
              }
              placeholder="0x..."
            />
          </label>
          <button disabled={!workspaceReady || !contractAddress || Boolean(pendingAction)} type="submit">
            Assign shipment
          </button>
        </form>
      )
    }

    if (activeProductAction === 'update') {
      return (
        <form className="modal-action-form" onSubmit={updateShipment}>
          <label>
            Status
            <select
              required
              value={shipmentForm.status}
              onChange={(event) => setShipmentForm({ ...shipmentForm, status: event.target.value })}
            >
              <option value="" disabled>
                Select a status
              </option>
              {shipmentStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Location
            <input
              value={shipmentForm.location}
              onChange={(event) => setShipmentForm({ ...shipmentForm, location: event.target.value })}
              placeholder="Calamba depot"
            />
          </label>
          <button disabled={!workspaceReady || !contractAddress || Boolean(pendingAction)} type="submit">
            Record shipment status
          </button>
        </form>
      )
    }

    if (activeProductAction === 'confirm') {
      return (
        <div className="modal-action-form">
          <p className="action-note">
            Receipt becomes available after the transporter marks this product ready for vendor confirmation.
          </p>
          <button
            disabled={!workspaceReady || !contractAddress || Boolean(pendingAction) || !isReadyForVendor}
            type="button"
            onClick={() => void confirmDelivery()}
          >
            Received
          </button>
        </div>
      )
    }

    return null
  }

  const renderProductActionModal = () => {
    if (!modalProduct || !activeProductAction) return null

    const productAction = getProductAction(modalProduct)
    if (!productAction || productAction.action !== activeProductAction) return null

    return (
      <div className="modal-backdrop action-modal-backdrop" role="presentation" onMouseDown={closeProductActionModal}>
        <section
          aria-modal="true"
          className="product-modal product-action-modal"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <p className="eyebrow">Product #{modalProduct.id.toString()}</p>
              <h2>{productAction.title}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={closeProductActionModal}
              title="Close action"
            >
              <FaXmark aria-hidden="true" />
            </button>
          </div>
          <div className="product-action-modal-body">
            {renderProductActionForm(modalProduct)}
          </div>
        </section>
      </div>
    )
  }

  const roleAction = (() => {
    const role = participantProfile?.role

    if (role === 'Farmer') {
      return (
        <div className="farmer-dashboard">
          {renderRegisterProductForm()}
          {renderProductSection(
            'Farmer products',
            'Registered products',
            <FaSeedling aria-hidden="true" />,
            roleProductGroups.farmerProducts,
            'No products registered by this farmer yet.',
          )}
        </div>
      )
    }

    if (role === 'Trader') {
      return (
        <div className="role-section-grid">
          {renderProductSection(
            'Trader products',
            'Owned stock',
            <FaEthereum aria-hidden="true" />,
            roleProductGroups.traderStock,
            'No active stock owned by this trader.',
          )}
          {renderProductSection(
            'Trader history',
            'Completed sales',
            <FaCircleCheck aria-hidden="true" />,
            roleProductGroups.traderCompletedSales,
            'No completed sales recorded for this trader yet.',
          )}
        </div>
      )
    }

    if (role === 'Transporter') {
      return (
        <div className="role-section-grid">
          {renderProductSection(
            'Transporter jobs',
            'Assigned shipments',
            <FaTruck aria-hidden="true" />,
            roleProductGroups.transporterAssigned,
            'No active shipment jobs assigned to this transporter.',
          )}
          {renderProductSection(
            'Transporter history',
            'Completed shipments',
            <FaCircleCheck aria-hidden="true" />,
            roleProductGroups.transporterCompleted,
            'No completed shipments recorded for this transporter yet.',
          )}
        </div>
      )
    }

    if (role === 'Vendor') {
      return (
        <div className="role-section-grid">
          {renderProductSection(
            'Vendor products',
            'Incoming products',
            <FaCircleCheck aria-hidden="true" />,
            roleProductGroups.vendorIncoming,
            'No incoming products assigned to this vendor.',
          )}
          {renderProductSection(
            'Vendor history',
            'Received products',
            <FaCircleCheck aria-hidden="true" />,
            roleProductGroups.vendorReceived,
            'No received products recorded for this vendor yet.',
          )}
        </div>
      )
    }

    return (
      <section className="empty-state">
        No workspace actions are available for this participant profile.
      </section>
    )
  })()

  return (
    <main className="site-shell">
      <header className="top-bar">
        <a className="brandmark" href="#top" aria-label="RiceChain home">
          <span className="brand-icon">
            <FaSeedling aria-hidden="true" />
          </span>
          <span>RiceChain</span>
        </a>

        <div className="top-actions">
          {!isConnected ? (
            <button type="button" className="secondary-button wallet-button" onClick={connectWallet}>
              <FaWallet aria-hidden="true" />
              <span>Connect MetaMask</span>
            </button>
          ) : (
            <div className="profile-menu">
              <button
                type="button"
                className="profile-button"
                aria-expanded={isProfileOpen}
                onClick={() => setIsProfileOpen((current) => !current)}
              >
                <FaIdBadge aria-hidden="true" />
                <span>{formatAddress(wallet.address)}</span>
                <FaChevronDown aria-hidden="true" />
              </button>

              {isProfileOpen ? (
                <div className="profile-dropdown">
                  <div className="dropdown-summary">
                    <span>Connected wallet</span>
                    <strong>{wallet.address}</strong>
                  </div>

                  <div className="profile-dropdown-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setIsParticipantModalOpen(true)
                        setIsProfileOpen(false)
                      }}
                    >
                      {hasParticipantProfile ? 'Profile' : 'Create profile'}
                    </button>

                    <button
                      type="button"
                      className="disconnect-button"
                      onClick={disconnectWallet}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </header>

      {toasts.length > 0 ? (
        <div className="toast-region" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <section className={`toast toast-${toast.type}`} key={toast.id}>
              <span>{toast.text}</span>
              <button
                type="button"
                className="toast-close"
                onClick={() => dismissToast(toast.id)}
                title="Dismiss alert"
              >
                <FaXmark aria-hidden="true" />
              </button>
            </section>
          ))}
        </div>
      ) : null}

      <div className="app-shell" id="top">
        {!contractAddress ? (
          <section className="notice error-notice">
            Set <code>VITE_RICECHAIN_CONTRACT_ADDRESS</code> in <code>.env</code> after deploying the
            contract to enable blockchain reads and writes.
          </section>
        ) : null}

        {!isConnected ? (
          <section className="setup-panel connect-panel">
            <div>
              <p className="eyebrow">Start here</p>
              <h2>Connect MetaMask to open RiceChain.</h2>
              <p className="lead">
                Your wallet identifies your participant profile and signs each traceability
                action on Sepolia.
              </p>
            </div>
            <button type="button" onClick={connectWallet}>
              <FaWallet aria-hidden="true" />
              Connect MetaMask
            </button>
          </section>
        ) : !isSepolia ? (
          <section className="setup-panel connect-panel">
            <div>
              <p className="eyebrow">Network required</p>
              <h2>Switch MetaMask to Sepolia.</h2>
              <p className="lead">
                RiceChain reads and writes against the configured Sepolia contract address.
              </p>
            </div>
            <button type="button" onClick={switchToSepolia}>
              <FaEthereum aria-hidden="true" />
              Switch to Sepolia
            </button>
          </section>
        ) : !hasParticipantProfile ? (
          <section className="setup-panel profile-setup-panel">
            <div>
              <p className="eyebrow">Participant profile</p>
              <h2>Create participant profile</h2>
              <p className="lead">
                Save your role details before opening the matching RiceChain workspace.
              </p>
            </div>
            {renderParticipantProfileForm('profile-form setup-form')}
          </section>
        ) : (
          <section className="workspace-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{profileDisplayName}</p>
                <h2>Your workspace</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => void refreshAll()} title="Refresh data">
                <FaRotate aria-hidden="true" />
              </button>
            </div>
            {roleAction}
          </section>
        )}
      </div>

      {/* Participant modal */}
      {isParticipantModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsParticipantModalOpen(false)}
        >
          <section
            aria-modal="true"
            className="product-modal participant-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Participant profile</p>
                <h2>{hasParticipantProfile ? 'Update profile' : 'Create profile'}</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setIsParticipantModalOpen(false)}
                title="Close participant profile"
              >
                <FaXmark aria-hidden="true" />
              </button>
            </div>

            <div className="participant-modal-body">
              {renderParticipantProfileForm('profile-form')}
            </div>
          </section>
        </div>
      ) : null}

      {/* Product modal */}
      {modalProduct ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeProductModal}>
          <section
            aria-modal="true"
            className="product-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Product #{modalProduct.id.toString()}</p>
                <h2>{modalProduct.productName}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeProductModal} title="Close product details">
                <FaXmark aria-hidden="true" />
              </button>
            </div>

            <div className="modal-main product-modal-main">
              {renderProductSummary(modalProduct)}
              <section className="modal-history">
                <div className="section-heading compact-heading">
                  <div>
                    <p className="eyebrow">Product audit trail</p>
                    <h2>History</h2>
                  </div>
                </div>
                {renderHistory()}
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {renderProductActionModal()}
      {renderTraceEventModal()}

      {pendingAction ? <div className="pending-bar">{pendingAction} waiting for confirmation...</div> : null}
    </main>
  )
}

export default App
