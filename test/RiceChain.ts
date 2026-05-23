import assert from 'node:assert/strict'
import { describe, it } from 'mocha'
import { network } from 'hardhat'

const { ethers } = await network.connect()

async function deployRiceChain() {
  const [farmer, trader, transporter, vendor, other] = await ethers.getSigners()
  const riceChain = await ethers.deployContract('RiceChain')
  await riceChain.waitForDeployment()

  return { riceChain, farmer, trader, transporter, vendor, other }
}

async function registerSupplyChainParticipants(
  riceChain: Awaited<ReturnType<typeof deployRiceChain>>['riceChain'],
  accounts: Omit<Awaited<ReturnType<typeof deployRiceChain>>, 'riceChain'>,
) {
  await riceChain
    .connect(accounts.farmer)
    .registerOrUpdateParticipant('Carlo Bernardo', 'Farmer', '09171234567', 'Nueva Ecija Farm Cooperative')
  await riceChain
    .connect(accounts.trader)
    .registerOrUpdateParticipant('Angela Cating', 'Trader', '09170000000', 'Rice Trading Co.')
  await riceChain
    .connect(accounts.transporter)
    .registerOrUpdateParticipant('Ramon Santos', 'Transporter', '09171111111', 'Luzon Freight')
  await riceChain
    .connect(accounts.vendor)
    .registerOrUpdateParticipant('Mila Reyes', 'Vendor', '09172222222', 'Market Rice Store')
})

describe('RiceChain', function () {
  it('registers a participant profile for the connected wallet', async function () {
    const { riceChain, farmer } = await deployRiceChain()

    await riceChain.registerOrUpdateParticipant(
      'Carlo Bernardo',
      'Farmer',
      '09171234567',
      'Nueva Ecija Farm Cooperative',
    )

    const participant = await riceChain.getParticipant(farmer.address)

    assert.equal(participant.name, 'Carlo Bernardo')
    assert.equal(participant.role, 'Farmer')
    assert.equal(participant.contact, '09171234567')
    assert.equal(participant.organization, 'Nueva Ecija Farm Cooperative')
    assert.equal(participant.exists, true)
    assert.equal(participant.registeredAt, participant.updatedAt)
  })

  it('updates a participant profile while preserving original registration time', async function () {
    const { riceChain, farmer } = await deployRiceChain()

    await riceChain.registerOrUpdateParticipant('Angela Cating', 'Trader', '09170000000', 'Rice Trading Co.')
    const original = await riceChain.getParticipant(farmer.address)

    await riceChain.registerOrUpdateParticipant('Angela Cating', 'Vendor', '09179999999', 'Market Rice Store')
    const updated = await riceChain.getParticipant(farmer.address)

    assert.equal(updated.name, 'Angela Cating')
    assert.equal(updated.role, 'Vendor')
    assert.equal(updated.contact, '09179999999')
    assert.equal(updated.organization, 'Market Rice Store')
    assert.equal(updated.registeredAt, original.registeredAt)
    assert.equal(updated.exists, true)
  })

  it('rejects invalid participant profiles', async function () {
    const { riceChain } = await deployRiceChain()

    await assert.rejects(
      riceChain.registerOrUpdateParticipant('', 'Farmer', '09171234567', 'Farm Cooperative'),
      /Participant name required/,
    )
    await assert.rejects(
      riceChain.registerOrUpdateParticipant('Rowell Cruz', 'Consumer', '09171234567', 'Local Market'),
      /Invalid participant role/,
    )
  })

  it('runs the proposal-aligned farm-to-market workflow', async function () {
    const { riceChain, farmer, trader, transporter, vendor, other } = await deployRiceChain()
    await registerSupplyChainParticipants(riceChain, { farmer, trader, transporter, vendor, other })

    await riceChain.connect(farmer).registerProduct('Jasmine Rice', 'BATCH-001', 'Nueva Ecija', '25kg sacks')
    await riceChain.connect(farmer).transferOwnership(1n, trader.address)
    await riceChain.connect(trader).assignShipment(1n, transporter.address, vendor.address)
    await riceChain.connect(transporter).updateShipment(1n, 'In transit', 'Calamba depot')
    await riceChain.connect(transporter).updateShipment(1n, 'Ready for vendor confirmation', 'Market stall')
    await riceChain.connect(vendor).confirmDelivery(1n)

    const product = await riceChain.getProduct(1n)
    const history = await riceChain.getHistory(1n)

    assert.equal(product.productName, 'Jasmine Rice')
    assert.equal(product.farmer, farmer.address)
    assert.equal(product.currentOwner, vendor.address)
    assert.equal(product.assignedTransporter, transporter.address)
    assert.equal(product.assignedVendor, vendor.address)
    assert.equal(product.currentStatus, 'Delivered')
    assert.equal(product.currentLocation, 'Market stall')
    assert.equal(product.delivered, true)
    assert.equal(history.length, 6)
    assert.equal(history[0].action, 'Product registered')
    assert.equal(history[1].action, 'Ownership transferred')
    assert.equal(history[2].action, 'Shipment assigned')
    assert.equal(history[3].action, 'Shipment updated')
    assert.equal(history[4].action, 'Shipment updated')
    assert.equal(history[5].action, 'Delivery confirmed')
  })

  it('requires farmer role for product registration and trader receiver for ownership transfer', async function () {
    const { riceChain, farmer, trader, transporter, vendor, other } = await deployRiceChain()
    await registerSupplyChainParticipants(riceChain, { farmer, trader, transporter, vendor, other })

    await assert.rejects(
      riceChain.connect(trader).registerProduct('Wrong Role Rice', 'BATCH-002', 'Pampanga', ''),
      /Invalid participant role for action/,
    )

    await riceChain.connect(farmer).registerProduct('Dinorado Rice', 'BATCH-003', 'Isabela', '')

    await assert.rejects(
      riceChain.connect(farmer).transferOwnership(1n, transporter.address),
      /Invalid participant role for action/,
    )

    await riceChain.connect(farmer).transferOwnership(1n, trader.address)

    await assert.rejects(
      riceChain.connect(trader).transferOwnership(1n, vendor.address),
      /Invalid participant role for action/,
    )
  })

  it('requires the current trader owner to assign a registered transporter and vendor', async function () {
    const { riceChain, farmer, trader, transporter, vendor, other } = await deployRiceChain()
    await registerSupplyChainParticipants(riceChain, { farmer, trader, transporter, vendor, other })

    await riceChain.connect(farmer).registerProduct('Brown Rice', 'BATCH-004', 'Laguna', '')

    await assert.rejects(
      riceChain.connect(trader).assignShipment(1n, transporter.address, vendor.address),
      /Only current owner/,
    )

    await riceChain.connect(farmer).transferOwnership(1n, trader.address)

    await assert.rejects(
      riceChain.connect(trader).assignShipment(1n, other.address, vendor.address),
      /Participant not registered/,
    )

    await riceChain
      .connect(other)
      .registerOrUpdateParticipant('Wrong Role', 'Farmer', '09173333333', 'Other Farm')

    await assert.rejects(
      riceChain.connect(trader).assignShipment(1n, other.address, vendor.address),
      /Invalid participant role for action/,
    )

    await riceChain.connect(trader).assignShipment(1n, transporter.address, vendor.address)
  })

  it('allows only assigned transporter to update and assigned vendor to confirm', async function () {
    const { riceChain, farmer, trader, transporter, vendor, other } = await deployRiceChain()
    await registerSupplyChainParticipants(riceChain, { farmer, trader, transporter, vendor, other })

    await riceChain.connect(farmer).registerProduct('White Rice', 'BATCH-005', 'Bulacan', '')
    await riceChain.connect(farmer).transferOwnership(1n, trader.address)

    await assert.rejects(
      riceChain.connect(transporter).updateShipment(1n, 'In transit', 'Depot'),
      /Only assigned transporter/,
    )

    await riceChain.connect(trader).assignShipment(1n, transporter.address, vendor.address)

    await assert.rejects(
      riceChain.connect(trader).updateShipment(1n, 'In transit', 'Depot'),
      /Invalid participant role for action/,
    )
    await assert.rejects(
      riceChain.connect(vendor).updateShipment(1n, 'In transit', 'Depot'),
      /Invalid participant role for action/,
    )

    await riceChain.connect(transporter).updateShipment(1n, 'In transit', 'Depot')

    await assert.rejects(
      riceChain.connect(transporter).confirmDelivery(1n),
      /Invalid participant role for action/,
    )
    await assert.rejects(
      riceChain.connect(vendor).confirmDelivery(1n),
      /Shipment not ready/,
    )

    await riceChain.connect(transporter).updateShipment(1n, 'Ready for vendor confirmation', 'Vendor receiving area')
    await riceChain.connect(vendor).confirmDelivery(1n)

    const product = await riceChain.getProduct(1n)
    assert.equal(product.currentOwner, vendor.address)
    assert.equal(product.currentStatus, 'Delivered')

    await assert.rejects(
      riceChain.connect(transporter).updateShipment(1n, 'Delivered late', 'Market'),
      /Product already delivered/,
    )
  })

  it('rejects invalid product IDs and unauthorized ownership transfers', async function () {
    const { riceChain, farmer, trader, transporter, vendor, other } = await deployRiceChain()
    await registerSupplyChainParticipants(riceChain, { farmer, trader, transporter, vendor, other })

    await riceChain.connect(farmer).registerProduct('Red Rice', 'BATCH-006', 'Tarlac', '')

    await assert.rejects(
      riceChain.connect(trader).transferOwnership(1n, vendor.address),
      /Only current owner/,
    )
    await assert.rejects(
      riceChain.connect(farmer).transferOwnership(999n, trader.address),
      /Product does not exist/,
    )
  })
})
