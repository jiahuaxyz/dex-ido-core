import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { dexIDOPoolFixture } from './fixtures'
import { DAYS, MINUTES, expandTo18Decimals, mineBlock, HOURS } from './utils'

chai.use(solidity)

describe('DexIDOPool Test', () => {
    const provider = new MockProvider({
        ganacheOptions: {
            hardfork: 'istanbul',
            mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
            gasLimit: 9999999,
        },
    })
    const [owner, top, user, user1, user2, user3, user4, user5, user6] = provider.getWallets()
    const loadFixture = createFixtureLoader([owner], provider)

    let testERC20: Contract
    let dexchangeCore: Contract
    let dexIDOPool: Contract
    beforeEach(async () => {
        const fixture = await loadFixture(dexIDOPoolFixture)
        dexchangeCore = fixture.dexchangeCore
        testERC20 = fixture.testERC20
        dexIDOPool = fixture.dexIDOPool
        await dexchangeCore.setPrice(testERC20.address, expandTo18Decimals(2))
    })

    it('Deploy pool', async () => {

        const { timestamp: now } = await provider.getBlock('latest')

        await expect(dexIDOPool.deploy(now + 10, 5 * DAYS, 50, dexchangeCore.address, top.address, {}))
            .to.be.revertedWith('DexIDOPool::deploy: require sending DEX to the pool')

        await expect(dexIDOPool.deploy(now - 10, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.be.revertedWith('DexIDOPool::deploy: start time is too soon')

        await expect(dexIDOPool.deploy(now + 10, 0 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.be.revertedWith('DexIDOPool::deploy: duration is too short')

        await expect(dexIDOPool.deploy(now + 10, 5 * DAYS, 1001, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.be.revertedWith('DexIDOPool::deploy: reward rate use permil')

        await expect(dexIDOPool.deploy(now + 10, 5 * DAYS, 1000, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.be.revertedWith('DexIDOPool::deploy: reward rate use permil')

        await expect(dexIDOPool.connect(user).deploy(now + 10, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.be.revertedWith('Ownable: caller is not the owner')

        await expect(dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.emit(dexIDOPool, 'Deployed')
            .withArgs(now + 2 * MINUTES, 5 * DAYS, expandTo18Decimals(100000), expandTo18Decimals(20000), 50, owner.address, dexchangeCore.address, top.address);
        
        await expect(dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.be.revertedWith('DexIDOPool::deploy: the pool have been deployed')
    })


    it('正确地添加矿池', async () => {

        const { timestamp: now } = await provider.getBlock('latest');
        
        await expect(dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
        .to.emit(dexIDOPool, 'Deployed')
        .withArgs(now + 2 * MINUTES, 5 * DAYS, expandTo18Decimals(100000), expandTo18Decimals(20000), 50, owner.address, dexchangeCore.address, top.address);

        expect(await dexIDOPool.poolStart()).eq(now + 2 * MINUTES);
        expect(await dexIDOPool.poolDuration()).eq(5 * DAYS);
        expect(await dexIDOPool.poolTotal()).eq(expandTo18Decimals(100000) );
        expect(await dexIDOPool.poolDailyLimit()).eq(expandTo18Decimals(100000).div(5));
        expect(await dexIDOPool.exchangedDaily(now)).eq(0);
        expect(await dexIDOPool.totalDeposit()).eq(0);


    })

    it('矿池总量大于0', async () => {

        const { timestamp: now } = await provider.getBlock('latest');

        await expect(dexIDOPool.deploy(now + 10, 5 * DAYS, 50, dexchangeCore.address, top.address, {}))
            .to.be.revertedWith('DexIDOPool::deploy: require sending DEX to the pool');

        await expect(dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: 0 }))
            .to.be.revertedWith('DexIDOPool::deploy: require sending DEX to the pool');

    })

    it('dexchange为一个有效的合约地址', async () => {

        const { timestamp: now } = await provider.getBlock('latest');

        await expect(dexIDOPool.deploy(now + 10, 5 * DAYS, 50, user.address, top.address, {value: expandTo18Decimals(100000)}))
            .to.be.revertedWith("DexIDOPool::deploy: dexchangeCore is non-contract.");

    })

    it('暂停状态下不可创建矿池', async () => {

        const { timestamp: now } = await provider.getBlock('latest');
        await dexIDOPool.stop()

        await expect(dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.be.revertedWith('DexIDOPool::stoppable: contract has been stopped.')

        await dexIDOPool.start()

        await expect(dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
        .to.emit(dexIDOPool, 'Deployed')
        .withArgs(now + 2 * MINUTES, 5 * DAYS, expandTo18Decimals(100000), expandTo18Decimals(20000), 50, owner.address, dexchangeCore.address, top.address);


    })

    it('Deposit', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        await mineBlock(provider, now + 3 * MINUTES)

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) })
        await dexIDOPool.connect(user).accept(top.address)
        await expect(dexIDOPool.connect(user).deposit({ value: 0 }))
            .to.be.revertedWith('DexIDOPool::deposit: require sending DEX to the pool')

        await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(2) })

        const totalDeposit = await dexIDOPool.totalDeposit();
        await expect(totalDeposit).to.equal(expandTo18Decimals(4))

        const balance = await dexIDOPool.balanceOf(user.address)
        await expect(balance).to.equal(expandTo18Decimals(2))
    })

    it('正常质押', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        await mineBlock(provider, now + 3 * MINUTES)
        const { timestamp: now2 } = await provider.getBlock('latest')

        await expect(dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) }))
            .to.emit(dexIDOPool, 'Deposited').withArgs(top.address, expandTo18Decimals(2))

        await dexIDOPool.connect(user).accept(top.address)
        await expect(dexIDOPool.connect(user).deposit({ value: 0 }))
            .to.be.revertedWith('DexIDOPool::deposit: require sending DEX to the pool')

        await expect(dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(2) }))
            .to.emit(dexIDOPool, 'Deposited').withArgs(user.address, expandTo18Decimals(2))

        // 验证各变量变化是否正常
        expect(await dexIDOPool.totalDeposit()).to.equal(expandTo18Decimals(4))
        expect(await dexIDOPool.dailyDeposit(now2)).to.equal(expandTo18Decimals(4))
        expect(await dexIDOPool.balanceOf(user.address)).to.equal(expandTo18Decimals(2))
        expect(await dexIDOPool.dailyDepositOf(now2, user.address)).to.equal(expandTo18Decimals(2))
        expect(await dexIDOPool.availableToExchange(user.address)).to.equal(0)

        //多次质押
        await expect(dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(2) }))
            .to.emit(dexIDOPool, 'Deposited').withArgs(user.address, expandTo18Decimals(2))

        await expect(dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(2) }))
            .to.emit(dexIDOPool, 'Deposited').withArgs(user.address, expandTo18Decimals(2))

        // 验证各变量变化是否正常
        expect(await dexIDOPool.totalDeposit()).to.equal(expandTo18Decimals(8))
        expect(await dexIDOPool.dailyDeposit(now2)).to.equal(expandTo18Decimals(8))
        expect(await dexIDOPool.balanceOf(user.address)).to.equal(expandTo18Decimals(6))
        expect(await dexIDOPool.dailyDepositOf(now2, user.address)).to.equal(expandTo18Decimals(6))
        expect(await dexIDOPool.availableToExchange(user.address)).to.equal(0)



    })

    it('矿池未开始', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        // await mineBlock(provider, now + 3 * MINUTES)

        await expect(dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) }))
            .to.be.revertedWith('DexIDOPool::deposit: the pool not ready.')
    })

    it('矿池已结束', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        await mineBlock(provider, now + 6 * DAYS)

        await expect(dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) }))
            .to.be.revertedWith('DexIDOPool::deposit: the pool already ended.')
    })

    it('矿池已暂停', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        await mineBlock(provider, now + 3 * MINUTES)

        await dexIDOPool.stop()
        expect(await dexIDOPool.stopped()).to.equal(true)
        
        await expect(dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) }))
            .to.be.revertedWith('DexIDOPool::stoppable: contract has been stopped.')

        await dexIDOPool.start()
        expect(await dexIDOPool.stopped()).to.equal(false)

        await expect(dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) }))
            .to.emit(dexIDOPool, 'Deposited').withArgs(top.address, expandTo18Decimals(2))

    })

    it('最后一天质押', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        await mineBlock(provider, now + 5 * DAYS)

        // await expect(dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) }))
        //     .to.be.reverted

        await expect(dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) }))
            .to.emit(dexIDOPool, 'Deposited').withArgs(top.address, expandTo18Decimals(2))

    })

    
    it('无邀请关系进行质押', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        await mineBlock(provider, now + 5 * MINUTES)

        await expect(dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(2) }))
            .to.revertedWith("DexIDOPool::deposit: you must have a referrer")
        
        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) })
        await dexIDOPool.connect(user).accept(top.address)

        await expect(dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(2) }))
            .to.emit(dexIDOPool,'Deposited')
        


    })

    it('Account available exchange DEX amount', async () => {
        var { timestamp: now } = await provider.getBlock('latest')
        await dexIDOPool.deploy(now + 2 * MINUTES, 180 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(1800000) })
        await mineBlock(provider, now + 2 * MINUTES)
        const { timestamp: now1 } = await provider.getBlock('latest')
        const daily = 10000

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(5000) })
        await dexIDOPool.connect(user).accept(top.address)
        await dexIDOPool.connect(user1).accept(top.address)
        await dexIDOPool.connect(user2).accept(top.address)
        await dexIDOPool.connect(user3).accept(top.address)

        // DAY 1
        await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(40000) })
        await dexIDOPool.connect(user1).deposit({ value: expandTo18Decimals(30000) })
        await dexIDOPool.connect(user2).deposit({ value: expandTo18Decimals(20000) })
        await dexIDOPool.connect(user3).deposit({ value: expandTo18Decimals(5000) })

        await expect(await dexIDOPool.totalDeposit()).to.equal(expandTo18Decimals(100000))

        await expect(await dexIDOPool.availableToExchange(user.address))
            .to.equal(expandTo18Decimals(0))
        await expect(await dexIDOPool.availableToExchange(user1.address))
            .to.equal(expandTo18Decimals(0))
        await expect(await dexIDOPool.availableToExchange(user2.address))
            .to.equal(expandTo18Decimals(0))
        await expect(await dexIDOPool.availableToExchange(user3.address))
            .to.equal(expandTo18Decimals(0))

        // 验证各变量变化是否正常
        expect(await dexIDOPool.dailyDeposit(now1)).to.equal(expandTo18Decimals(100000))
        expect(await dexIDOPool.balanceOf(user.address)).to.equal(expandTo18Decimals(40000))
        expect(await dexIDOPool.dailyDepositOf(now1, user.address)).to.equal(expandTo18Decimals(40000))
        expect(await dexIDOPool.availableToExchange(user.address)).to.equal(0)

        // DAY 2
        await mineBlock(provider, now + 1 * DAYS + 1 * HOURS)
        var { timestamp: now2 } = await provider.getBlock('latest')

        // await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(0) })
        await dexIDOPool.connect(user1).deposit({ value: expandTo18Decimals(50000) })
        // await dexIDOPool.connect(user2).deposit({ value: expandTo18Decimals(0) })
        await dexIDOPool.connect(user3).deposit({ value: expandTo18Decimals(50000) })


        // 验证各变量变化是否正常
        expect(await dexIDOPool.totalDeposit()).to.equal(expandTo18Decimals(200000))
        expect(await dexIDOPool.dailyDeposit(now2)).to.equal(expandTo18Decimals(100000))

        expect(await dexIDOPool.balanceOf(user.address)).to.equal(expandTo18Decimals(40000))
        expect(await dexIDOPool.balanceOf(user1.address)).to.equal(expandTo18Decimals(30000 + 50000))
        expect(await dexIDOPool.balanceOf(user2.address)).to.equal(expandTo18Decimals(20000))
        expect(await dexIDOPool.balanceOf(user3.address)).to.equal(expandTo18Decimals(5000 + 50000))

        expect(await dexIDOPool.dailyDepositOf(now2, user.address)).to.equal(expandTo18Decimals(0))
        expect(await dexIDOPool.dailyDepositOf(now2, user1.address)).to.equal(expandTo18Decimals(50000))
        expect(await dexIDOPool.dailyDepositOf(now2, user2.address)).to.equal(expandTo18Decimals(0))
        expect(await dexIDOPool.dailyDepositOf(now2, user3.address)).to.equal(expandTo18Decimals(50000))

        expect(await dexIDOPool.availableToExchange(user.address)).to.equal(expandTo18Decimals(4000))
        expect(await dexIDOPool.availableToExchange(user1.address)).to.equal(expandTo18Decimals(3000))
        expect(await dexIDOPool.availableToExchange(user2.address)).to.equal(expandTo18Decimals(2000))
        expect(await dexIDOPool.availableToExchange(user3.address)).to.equal(expandTo18Decimals(500))


        // DAY 3
        await mineBlock(provider, now + 2 * DAYS + 1 * HOURS)
        var { timestamp: now3 } = await provider.getBlock('latest')

        // await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(0) })
        // await dexIDOPool.connect(user1).deposit({ value: expandTo18Decimals(5000) })
        // await dexIDOPool.connect(user2).deposit({ value: expandTo18Decimals(0) })
        // await dexIDOPool.connect(user3).deposit({ value: expandTo18Decimals(5000) })

        // 验证各变量变化是否正常
        expect(await dexIDOPool.totalDeposit()).to.equal(expandTo18Decimals(200000))
        expect(await dexIDOPool.dailyDeposit(now3)).to.equal(expandTo18Decimals(0))

        expect(await dexIDOPool.balanceOf(user.address)).to.equal(expandTo18Decimals(40000))
        expect(await dexIDOPool.balanceOf(user1.address)).to.equal(expandTo18Decimals(30000 + 50000))
        expect(await dexIDOPool.balanceOf(user2.address)).to.equal(expandTo18Decimals(20000))
        expect(await dexIDOPool.balanceOf(user3.address)).to.equal(expandTo18Decimals(5000 + 50000))

        expect(await dexIDOPool.dailyDepositOf(now3, user.address)).to.equal(expandTo18Decimals(0))
        expect(await dexIDOPool.dailyDepositOf(now3, user1.address)).to.equal(expandTo18Decimals(0))
        expect(await dexIDOPool.dailyDepositOf(now3, user2.address)).to.equal(expandTo18Decimals(0))
        expect(await dexIDOPool.dailyDepositOf(now3, user3.address)).to.equal(expandTo18Decimals(0))

        expect(await dexIDOPool.availableToExchange(user.address)).to.equal(expandTo18Decimals(2000))
        expect(await dexIDOPool.availableToExchange(user1.address)).to.equal(expandTo18Decimals(4000))
        expect(await dexIDOPool.availableToExchange(user2.address)).to.equal(expandTo18Decimals(1000))
        expect(await dexIDOPool.availableToExchange(user3.address)).to.equal(expandTo18Decimals(2750))

    })


    it('Withdraw', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        await mineBlock(provider, now + 3 * MINUTES)

        await expect(dexIDOPool.connect(user).withdraw(0))
            .to.be.revertedWith('DexIDOPool::withdraw: the pool is not over, amount is invalid.')

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) })
        await dexIDOPool.connect(user).accept(top.address)
        await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(2) })

        await expect(dexIDOPool.connect(user).withdraw(expandTo18Decimals(3)))
            .to.be.revertedWith('DexIDOPool::withdraw: the amount deposited today is not enough.')

        await dexIDOPool.connect(user).withdraw(expandTo18Decimals(1))

        await mineBlock(provider, now + 3 * DAYS)

        await expect(dexIDOPool.connect(user).withdraw(0))
            .to.be.revertedWith('DexIDOPool::withdraw: the pool is not over, amount is invalid.')

        await mineBlock(provider, now + 6 * DAYS)

        await expect(await dexIDOPool.connect(user).withdraw(1))
            .to.changeEtherBalance(user, expandTo18Decimals(1), {includeFee: false})

        const totalDeposit = await dexIDOPool.totalDeposit();
        await expect(totalDeposit).to.equal(expandTo18Decimals(2))

        const balance = await dexIDOPool.balanceOf(user.address)
        await expect(balance).to.equal(expandTo18Decimals(0))
    })

    it('正常取消质押', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        await mineBlock(provider, now + 3 * MINUTES)

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) })

        await expect(dexIDOPool.connect(top).withdraw(0))
            .to.be.revertedWith('DexIDOPool::withdraw: the pool is not over, amount is invalid.')

        await expect(dexIDOPool.connect(top).withdraw(expandTo18Decimals(3)))
            .to.be.revertedWith('DexIDOPool::withdraw: the amount deposited today is not enough.')

        await expect(dexIDOPool.connect(top).withdraw(expandTo18Decimals(1)))
            .to.emit(dexIDOPool, 'Withdrawn').withArgs(top.address, expandTo18Decimals(1))

        await expect(dexIDOPool.connect(top).withdraw(expandTo18Decimals(1)))
            .to.emit(dexIDOPool, 'Withdrawn').withArgs(top.address, expandTo18Decimals(1))

        await expect(dexIDOPool.connect(top).withdraw(expandTo18Decimals(1)))
            .to.be.revertedWith('DexIDOPool::withdraw: the amount deposited today is not enough.')

    })

    it('矿池结束后取消质押', async () => {
        const { timestamp: now } = await provider.getBlock('latest')

        await dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) })

        await mineBlock(provider, now + 3 * MINUTES)

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) })
        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) })
        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) })

        expect(await dexIDOPool.balanceOf(top.address)).to.equal(expandTo18Decimals(6))


        //矿池结束
        await mineBlock(provider, now + 5 * DAYS + 3 * MINUTES)

        // await expect(dexIDOPool.connect(top).withdraw(expandTo18Decimals(70)))
        //     .to.be.revertedWith('DexIDOPool::withdraw: the amount deposited today is not enough.')

        // await expect(dexIDOPool.connect(top).withdraw(expandTo18Decimals(1)))
        //     .to.emit(dexIDOPool, 'Withdrawn').withArgs(top.address, expandTo18Decimals(1))

        // await expect(dexIDOPool.connect(top).withdraw(expandTo18Decimals(6)))
        // .to.be.revertedWith('DexIDOPool::withdraw: the amount deposited today is not enough.')

        // await expect(dexIDOPool.connect(top).withdraw(expandTo18Decimals(5)))
        //     .to.emit(dexIDOPool, 'Withdrawn').withArgs(top.address, expandTo18Decimals(5))

    })



    it('Contract stoppable', async () => {

        await dexIDOPool.stop()
        await expect(await dexIDOPool.stopped()).to.equal(true);

        var { timestamp: now } = await provider.getBlock('latest')

        await expect(dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.be.revertedWith('DexIDOPool::stoppable: contract has been stopped.')

        now = now + 3 * MINUTES
        await mineBlock(provider, now)

        await expect(dexIDOPool.connect(user).withdraw(0))
            .to.be.revertedWith('DexIDOPool::stoppable: contract has been stopped.');

        await expect(dexIDOPool.connect(user).start())
            .to.be.revertedWith("Ownable: caller is not the owner")

        await dexIDOPool.start()
        await expect(await dexIDOPool.stopped()).to.equal(false);

        await expect(dexIDOPool.deploy(now + 2 * MINUTES, 5 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(100000) }))
            .to.emit(dexIDOPool, 'Deployed')
    })


    it('Accept invitation', async () => {

        var { timestamp: now } = await provider.getBlock('latest')
        await dexIDOPool.deploy(now + 2 * MINUTES, 180 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(1800000) })
        await mineBlock(provider, now + 2 * MINUTES)
        
        await expect(dexIDOPool.connect(user).accept(user1.address))
            .to.be.revertedWith("DexIDOPool::accept: referrer did not deposit DEX");

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(2) })
        await dexIDOPool.connect(user1).accept(top.address)
        await dexIDOPool.connect(user2).accept(top.address)

        await dexIDOPool.connect(user1).deposit({ value: expandTo18Decimals(2) })
        await dexIDOPool.connect(user2).deposit({ value: expandTo18Decimals(2) })

        await dexIDOPool.connect(user).accept(user1.address)

        await expect(dexIDOPool.connect(user).accept(user2.address))
            .to.be.revertedWith("DexIDOPool::accept: has been accepted invitation");
    })

    it('Transfer', async () => {

        await expect(dexIDOPool.connect(user).transfer(testERC20.address, user1.address, 1000))
            .to.be.revertedWith("Ownable: caller is not the owner")

        await expect(dexIDOPool.connect(owner).transfer(user1.address, user2.address, 1000))
            .to.be.revertedWith("DexIDOPool::transfer: call to non-contract.")

        await expect(dexIDOPool.connect(owner).transfer(testERC20.address, user1.address, 0))
            .to.be.revertedWith("DexIDOPool::transfer: input amount is invalid.")

        await expect(dexIDOPool.connect(owner).transfer(testERC20.address, user1.address, 1000))
            .to.be.revertedWith("DexIDOPool::transfer: token balance is insufficient")

        await expect(await testERC20.balanceOf(dexIDOPool.address)).to.equal(0)
        await testERC20.transfer(dexIDOPool.address, expandTo18Decimals(2000))
        await expect(await testERC20.balanceOf(dexIDOPool.address)).to.equal(expandTo18Decimals(2000))
        
        await expect(await testERC20.balanceOf(user.address)).to.equal(0)
        await dexIDOPool.connect(owner).transfer(testERC20.address, user.address, expandTo18Decimals(1000))
        await expect(await testERC20.balanceOf(user.address)).to.equal(expandTo18Decimals(1000))
    })

    it('Refund', async () => {

        await expect(dexIDOPool.connect(user).refund(user1.address, 1000))
            .to.be.revertedWith("Ownable: caller is not the owner")

        await expect(dexIDOPool.connect(owner).refund(user1.address, 0))
            .to.be.revertedWith("DexIDOPool::refund: input amount is invalid.")

        await expect(dexIDOPool.connect(owner).refund(user1.address, 1000))
            .to.be.revertedWith("DexIDOPool::refund: balance is insufficient")

        var { timestamp: now } = await provider.getBlock('latest')
        await dexIDOPool.deploy(now + 2 * MINUTES, 180 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(1800000) })
        
        await expect(await provider.getBalance(dexIDOPool.address)).to.equal(expandTo18Decimals(1800000))
        
        await expect(await dexIDOPool.connect(owner).refund(user.address, expandTo18Decimals(1000)))
            .to.changeEtherBalances([dexIDOPool, user], ["-" + expandTo18Decimals(1000).toString(), expandTo18Decimals(1000)], {includeFee: false})

    })

    it("Buy dex, only 1 referrer", async () => {

        var { timestamp: now } = await provider.getBlock('latest')
        await dexIDOPool.deploy(now + 2 * MINUTES, 180 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(1800000) })

        await expect(dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(2000)))
            .to.be.revertedWith("DexIDOPool::buy: the pool not ready.")

        await mineBlock(provider, now + 2 * MINUTES)

        await expect(dexIDOPool.connect(user).buy(user1.address, expandTo18Decimals(2000)))
            .to.be.revertedWith("DexIDOPool::buy: call to non-contract.")

        await expect(dexIDOPool.connect(user).buy(testERC20.address, 0))
            .to.be.revertedWith("DexIDOPool::buy: input amount is invalid.")

        const price = await dexchangeCore.price(testERC20.address)
        const amount = 2000
        const totalAmount = price.mul(amount)

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user1).accept(top.address)
        await dexIDOPool.connect(user1).deposit({ value: expandTo18Decimals(3000) })
        await dexIDOPool.connect(user).accept(user1.address)
        await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(1000) })
        
        // T+1
        await mineBlock(provider, now + 2 * MINUTES + 1 * DAYS)

        await expect(dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.be.revertedWith("DexIDOPool::buy: token balance is insufficient")

        await expect(() => testERC20.transfer(user.address, totalAmount))
            .to.changeTokenBalance(testERC20, user, totalAmount)
            
        await expect(await dexIDOPool.availableToExchange(user.address))
            .be.equal(expandTo18Decimals(amount)) // amount = 2000
        
        await expect(dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.be.revertedWith("DexIDOPool::buy: token allowance is insufficient")
        
        await testERC20.connect(user).approve(dexIDOPool.address, totalAmount)

        const tokenBefore = await testERC20.balanceOf(user.address)
        const poolBefore = await testERC20.balanceOf(dexIDOPool.address)

        // amount = 2000, rewards = amount * 50/1000  
        await expect(await dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.changeEtherBalances([dexIDOPool, user, user1, top], [
                    "-" + expandTo18Decimals(amount).toString(), // pool reduce DEX
                    expandTo18Decimals(1900), // amount - rewards
                    expandTo18Decimals(80), // rewards
                    expandTo18Decimals(20), // top
                ], {includeFee: false})
        
        const tokenAfter = await testERC20.balanceOf(user.address)
        const poolAfter = await testERC20.balanceOf(dexIDOPool.address)
        
        await expect(tokenBefore.sub(tokenAfter)).be.equal(totalAmount)
        await expect(poolAfter.sub(poolBefore)).be.equal(totalAmount)

        // end 
        await mineBlock(provider, now + 10 * MINUTES + 180 * DAYS)
        await expect(dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.be.revertedWith("DexIDOPool::buy: the pool already ended.")

    })

    it("Buy dex, only 2 referrer", async () => {

        var { timestamp: now } = await provider.getBlock('latest')
        await dexIDOPool.deploy(now + 2 * MINUTES, 180 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(1800000) })

        await mineBlock(provider, now + 2 * MINUTES)

        const price = await dexchangeCore.price(testERC20.address)
        const amount = 2000
        const totalAmount = price.mul(amount)

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user2).accept(top.address)
        await dexIDOPool.connect(user2).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user1).accept(user2.address)
        await dexIDOPool.connect(user1).deposit({ value: expandTo18Decimals(2000) })
        await dexIDOPool.connect(user).accept(user1.address)
        await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(1000) })
        
        // T+1
        await mineBlock(provider, now + 2 * MINUTES + 1 * DAYS)

        await testERC20.transfer(user.address, totalAmount)

        await expect(dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.be.revertedWith("DexIDOPool::buy: token allowance is insufficient")
        
        await testERC20.connect(user).approve(dexIDOPool.address, totalAmount)

        const tokenBefore = await testERC20.balanceOf(user.address)
        const poolBefore = await testERC20.balanceOf(dexIDOPool.address)

        // amount = 2000, rewards = amount * 50/1000  
        await expect(await dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.changeEtherBalances([dexIDOPool, user, user1, user2, top], [
                    "-" + expandTo18Decimals(amount).toString(), // pool reduce DEX
                    expandTo18Decimals(1900), // amount - rewards
                    expandTo18Decimals(60), // rewards referrer1
                    expandTo18Decimals(20), // rewards referrer2
                    expandTo18Decimals(20) // top
                ], {includeFee: false})
        
        const tokenAfter = await testERC20.balanceOf(user.address)
        const poolAfter = await testERC20.balanceOf(dexIDOPool.address)
        
        await expect(tokenBefore.sub(tokenAfter)).be.equal(totalAmount)
        await expect(poolAfter.sub(poolBefore)).be.equal(totalAmount)

    })

    it("Buy dex, only 3 referrer", async () => {

        var { timestamp: now } = await provider.getBlock('latest')
        await dexIDOPool.deploy(now + 2 * MINUTES, 180 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(1800000) })

        await mineBlock(provider, now + 2 * MINUTES)

        const price = await dexchangeCore.price(testERC20.address)
        const amount = 2000
        const totalAmount = price.mul(amount)

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user3).accept(top.address)
        await dexIDOPool.connect(user3).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user2).accept(user3.address)
        await dexIDOPool.connect(user2).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user1).accept(user2.address)
        await dexIDOPool.connect(user1).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user).accept(user1.address)
        await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(1000) })
        
        // T+1
        await mineBlock(provider, now + 2 * MINUTES + 1 * DAYS)

        await testERC20.transfer(user.address, totalAmount)

        await expect(dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.be.revertedWith("DexIDOPool::buy: token allowance is insufficient")
        
        await testERC20.connect(user).approve(dexIDOPool.address, totalAmount)

        const tokenBefore = await testERC20.balanceOf(user.address)
        const poolBefore = await testERC20.balanceOf(dexIDOPool.address)

        // amount = 2000, rewards = amount * 50/1000  
        await expect(await dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.changeEtherBalances([dexIDOPool, user, user1, user2, user3, top], [
                    "-" + expandTo18Decimals(amount).toString(), // pool reduce DEX
                    expandTo18Decimals(1900), // amount - rewards
                    expandTo18Decimals(40), // rewards referrer1
                    expandTo18Decimals(20), // rewards referrer2
                    expandTo18Decimals(20), // rewards referrer3
                    expandTo18Decimals(20), // top
                ], {includeFee: false})
        
        const tokenAfter = await testERC20.balanceOf(user.address)
        const poolAfter = await testERC20.balanceOf(dexIDOPool.address)
        
        await expect(tokenBefore.sub(tokenAfter)).be.equal(totalAmount)
        await expect(poolAfter.sub(poolBefore)).be.equal(totalAmount)

    })

    it("Buy dex, only 4 referrer", async () => {

        var { timestamp: now } = await provider.getBlock('latest')
        await dexIDOPool.deploy(now + 2 * MINUTES, 180 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(1800000) })

        await mineBlock(provider, now + 2 * MINUTES)

        const price = await dexchangeCore.price(testERC20.address)
        const amount = 2000
        const totalAmount = price.mul(amount)

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user4).accept(top.address)
        await dexIDOPool.connect(user4).deposit({ value: expandTo18Decimals(500) })
        await dexIDOPool.connect(user3).accept(user4.address)
        await dexIDOPool.connect(user3).deposit({ value: expandTo18Decimals(500) })
        await dexIDOPool.connect(user2).accept(user3.address)
        await dexIDOPool.connect(user2).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user1).accept(user2.address)
        await dexIDOPool.connect(user1).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user).accept(user1.address)
        await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(1000) })
        
        // T+1
        await mineBlock(provider, now + 2 * MINUTES + 1 * DAYS)

        await testERC20.transfer(user.address, totalAmount)

        await expect(dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.be.revertedWith("DexIDOPool::buy: token allowance is insufficient")
        
        await testERC20.connect(user).approve(dexIDOPool.address, totalAmount)

        const tokenBefore = await testERC20.balanceOf(user.address)
        const poolBefore = await testERC20.balanceOf(dexIDOPool.address)

        // amount = 2000, rewards = amount * 50/1000  
        await expect(await dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.changeEtherBalances([dexIDOPool, user, user1, user2, user3, user4, top], [
                    "-" + expandTo18Decimals(amount).toString(), // pool reduce DEX
                    expandTo18Decimals(1900), // amount - rewards
                    expandTo18Decimals(20), // rewards referrer1
                    expandTo18Decimals(20), // rewards referrer2
                    expandTo18Decimals(20), // rewards referrer3
                    expandTo18Decimals(20), // rewards referrer4
                    expandTo18Decimals(20), // top
                ], {includeFee: false})
        
        const tokenAfter = await testERC20.balanceOf(user.address)
        const poolAfter = await testERC20.balanceOf(dexIDOPool.address)
        
        await expect(tokenBefore.sub(tokenAfter)).be.equal(totalAmount)
        await expect(poolAfter.sub(poolBefore)).be.equal(totalAmount)

    })

    it("Buy dex, more than 5 referrers, the 6th referrer no reward", async () => {

        var { timestamp: now } = await provider.getBlock('latest')
        await dexIDOPool.deploy(now + 2 * MINUTES, 180 * DAYS, 50, dexchangeCore.address, top.address, { value: expandTo18Decimals(1800000) })

        await mineBlock(provider, now + 2 * MINUTES)

        const price = await dexchangeCore.price(testERC20.address)
        const amount = 2000
        const totalAmount = price.mul(amount)

        await dexIDOPool.connect(top).deposit({ value: expandTo18Decimals(250) })
        await dexIDOPool.connect(user6).accept(top.address)
        await dexIDOPool.connect(user6).deposit({ value: expandTo18Decimals(125) })
        await dexIDOPool.connect(user5).accept(user6.address)
        await dexIDOPool.connect(user5).deposit({ value: expandTo18Decimals(125) })
        await dexIDOPool.connect(user4).accept(user5.address)
        await dexIDOPool.connect(user4).deposit({ value: expandTo18Decimals(250) })
        await dexIDOPool.connect(user3).accept(user4.address)
        await dexIDOPool.connect(user3).deposit({ value: expandTo18Decimals(250) })
        await dexIDOPool.connect(user2).accept(user3.address)
        await dexIDOPool.connect(user2).deposit({ value: expandTo18Decimals(1000) })
        await dexIDOPool.connect(user1).accept(user2.address)
        await dexIDOPool.connect(user1).deposit({ value: expandTo18Decimals(2000) })
        await dexIDOPool.connect(user).accept(user1.address)
        await dexIDOPool.connect(user).deposit({ value: expandTo18Decimals(1000) })
        
        // T+1
        await mineBlock(provider, now + 2 * MINUTES + 1 * DAYS)

        await testERC20.transfer(user.address, totalAmount)

        await expect(dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.be.revertedWith("DexIDOPool::buy: token allowance is insufficient")
        
        await testERC20.connect(user).approve(dexIDOPool.address, totalAmount)

        const tokenBefore = await testERC20.balanceOf(user.address)
        const poolBefore = await testERC20.balanceOf(dexIDOPool.address)

        // amount = 2000, rewards = amount * 50/1000  
        await expect(await dexIDOPool.connect(user).buy(testERC20.address, expandTo18Decimals(amount)))
            .to.changeEtherBalances([dexIDOPool, user, user1, user2, user3, user4, user5, user6, top], [
                    "-" + expandTo18Decimals(amount).toString(), // pool reduce DEX
                    expandTo18Decimals(1900), // amount - rewards
                    expandTo18Decimals(20), // rewards referrer1
                    expandTo18Decimals(20), // rewards referrer2
                    expandTo18Decimals(20), // rewards referrer3
                    expandTo18Decimals(20), // rewards referrer4
                    expandTo18Decimals(20), // rewards referrer5
                    expandTo18Decimals(0), // referrer6 no rewards
                    expandTo18Decimals(0), // top no rewards
                ], {includeFee: false})
        
        const tokenAfter = await testERC20.balanceOf(user.address)
        const poolAfter = await testERC20.balanceOf(dexIDOPool.address)
        
        await expect(tokenBefore.sub(tokenAfter)).be.equal(totalAmount)
        await expect(poolAfter.sub(poolBefore)).be.equal(totalAmount)

    })
})
