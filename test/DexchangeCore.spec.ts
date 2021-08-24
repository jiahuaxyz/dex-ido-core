import chai, { expect } from 'chai'
import { Contract, BigNumber } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { dexIDOPoolFixture } from './fixtures'
import { DAYS, MINUTES, expandTo18Decimals, mineBlock, HOURS } from './utils'

chai.use(solidity)

describe('DexchangeCore Test', () => {
    const provider = new MockProvider({
        ganacheOptions: {
            hardfork: 'istanbul',
            mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
            gasLimit: 9999999,
        },
    })
    const [owner, top, user, user1, user2] = provider.getWallets()
    const loadFixture = createFixtureLoader([owner], provider)

    let dexchangeCore: Contract
    let dexIDOPool: Contract
    let testERC20: Contract
    beforeEach(async () => {
        const fixture = await loadFixture(dexIDOPoolFixture)
        dexchangeCore = fixture.dexchangeCore
        dexIDOPool = fixture.dexIDOPool
        testERC20 = fixture.testERC20

        const { timestamp: now } = await provider.getBlock('latest')
        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })
        await mineBlock(provider, now + 3 * MINUTES)
    })

    it('set price', async () => {

        await expect(dexchangeCore.setPrice(user.address, expandTo18Decimals(2)))
            .to.be.revertedWith("DexchangeCore::setPrice: call to non-contract");

        await expect(dexchangeCore.setPrice(testERC20.address, expandTo18Decimals(2)))
            .to.be.emit(dexchangeCore, "PriceChanged");

        expect(await dexchangeCore.price(testERC20.address)).to.equal(expandTo18Decimals(2))

    })

    it('添加兑换代币', async () => {

        await expect(dexchangeCore.setPrice(testERC20.address, expandTo18Decimals(2)))
            .to.be.emit(dexchangeCore, "PriceChanged").withArgs(testERC20.address,expandTo18Decimals(2));

        expect(await dexchangeCore.price(testERC20.address)).to.equal(expandTo18Decimals(2))

    })

    it('修改兑换代币价格', async () => {
        await expect(dexchangeCore.setPrice(testERC20.address, expandTo18Decimals(2)))
            .to.be.emit(dexchangeCore, "PriceChanged").withArgs(testERC20.address,expandTo18Decimals(2));

        expect(await dexchangeCore.price(testERC20.address)).to.equal(expandTo18Decimals(2));

        await expect(dexchangeCore.setPrice(testERC20.address, expandTo18Decimals(4)))
            .to.be.emit(dexchangeCore, "PriceChanged").withArgs(testERC20.address,expandTo18Decimals(4));

        expect(await dexchangeCore.price(testERC20.address)).to.equal(expandTo18Decimals(4));

    })
  
    it('删除兑换代币(兑率为0)', async () => {
        await expect(dexchangeCore.setPrice(testERC20.address, expandTo18Decimals(2)))
            .to.be.emit(dexchangeCore, "PriceChanged").withArgs(testERC20.address,expandTo18Decimals(2));

        expect(await dexchangeCore.price(testERC20.address)).to.equal(expandTo18Decimals(2));

        await expect(dexchangeCore.setPrice(testERC20.address, 0))
            .to.be.emit(dexchangeCore, "PriceChanged").withArgs(testERC20.address,0);

        expect(await dexchangeCore.price(testERC20.address)).to.equal(0);

    })

    it('无效合约地址', async () => {
        await expect(dexchangeCore.setPrice(user.address, expandTo18Decimals(2)))
            .to.be.revertedWith("DexchangeCore::setPrice: call to non-contract");
        
        await expect(dexchangeCore.setPrice(null, expandTo18Decimals(2)))
        .to.be.reverted;
    })
    
    it('兑率为空或小于0', async () => {        
        await expect(dexchangeCore.setPrice(testERC20.address, null))
        .to.be.reverted;
        await expect(dexchangeCore.setPrice(testERC20.address, -1))
        .to.be.reverted;
    })
    /*
    it('兑率为一个超大的数', async () => {        
        await expect(dexchangeCore.setPrice(testERC20.address, expandTo18Decimals(2*10**10)))
        .to.be.reverted;
    })*/


})
