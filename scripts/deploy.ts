import { network } from 'hardhat'

const { ethers } = await network.connect()

const riceChain = await ethers.deployContract('RiceChain')
await riceChain.waitForDeployment()

const address = await riceChain.getAddress()
const deployment = await riceChain.deploymentTransaction()

console.log(`RiceChain deployed to: ${address}`)
console.log(`Deployment transaction: ${deployment?.hash ?? 'unavailable'}`)
