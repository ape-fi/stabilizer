const { expect } = require('chai');
const { ethers, waffle } = require('hardhat');
const { impersonateAccount } = require('./testUtil');
const comptrollerAbi = require('../abi/comptroller');
const erc20Abi = require('../abi/erc20');
const apeTokenAbi = require('../abi/apeToken');
const baseRewardPoolAbi = require('../abi/baseRewardPool');
const curvePoolAbi = require('../abi/curvePool');

describe("StabilizerV3", () => {
  const toWei = ethers.utils.parseEther;
  const period = 594000; // 6.875 * 86400 (~7 day)
  const comptrollerAddress = '0xDE607fe5Cb415d83Fe4A976afD97e5DaEeaedB07';
  const apeAdminAddress = '0x02cA76E87779412a77Ee77C3600D72F68b9ea68C';
  const apeApeUSDAddress = '0xc7319dBc86A121313Bc48B7C54d0672756465031';
  const whaleAddress = '0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE';
  const crvAddress = '0xD533a949740bb3306d119CC777fa900bA034cd52';
  const cvxAddress = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';
  const fxsAddress = '0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0';
  const apeUSDAddress = '0xfF709449528B6fB6b88f557F7d93dEce33bca78D';
  const apeUSDCurveMetapoolAddress = '0x04b727C7e246CA70d496ecF52E6b6280f3c8077D';
  const apeUSDCurveGaugeAddress = '0xD6e48Cc0597a1Ee12a8BeEB88e22bFDb81777164';
  const convexVoterProxyAddress = '0x989AEb4d175e16225E39E87d0D97A3360524AD80';
  const apeUSDConvexDepositTokenAddress = '0x5eC62baD0Fa0C6b7F87b3b86EdfE1BcD2A3139e2';
  const apeUSDConvexBaseRewardPoolAddress = '0x51e6B84968D56a1E5BC93Ee264e95b1Ea577339c';
  const apeUSDStakedConvexWrapperForFraxAddress = '0x6a20FC1654A2167d00614332A5aFbB7EBcD9d414';

  let accounts;
  let admin, adminAddress;
  let user, userAddress;
  let apeAdmin, whale;
  let stabilizer;
  let comptroller;
  let crv, cvx, fxs;
  let apeUSD;
  let apeApeUSD;
  let apeUSDCurveLP; // apeUSD curve metapool LP
  let apeUSDCurveGauge; // apeUSD curve gauge
  let apeUSDConvexDeposit; // apeUSD convex deposit token
  let baseRewardPool; // apeUSD convex reward pool
  let apeUSDStakedConvexWrapperFrax; // apeUSD staked convex wrapper frax

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    admin = accounts[0];
    adminAddress = await admin.getAddress();
    user = accounts[1];
    userAddress = await user.getAddress();

    apeAdmin = await impersonateAccount(apeAdminAddress);
    whale = await impersonateAccount(whaleAddress);

    const stabilizerFactory = await ethers.getContractFactory("StabilizerV3");

    stabilizer = await stabilizerFactory.deploy(apeApeUSDAddress);

    // Set credit limit.
    comptroller = new ethers.Contract(comptrollerAddress, comptrollerAbi, waffle.provider);
    await comptroller.connect(apeAdmin)._setCreditLimit(stabilizer.address, apeApeUSDAddress, toWei('1000000'));
    await comptroller.connect(apeAdmin)._setCreditLimit(userAddress, apeApeUSDAddress, toWei('1000000'));

    crv = new ethers.Contract(crvAddress, erc20Abi, waffle.provider);
    cvx = new ethers.Contract(cvxAddress, erc20Abi, waffle.provider);
    fxs = new ethers.Contract(fxsAddress, erc20Abi, waffle.provider);
    apeUSD = new ethers.Contract(apeUSDAddress, erc20Abi, waffle.provider);
    apeApeUSD = new ethers.Contract(apeApeUSDAddress, apeTokenAbi, waffle.provider);
    apeUSDCurveLP = new ethers.Contract(apeUSDCurveMetapoolAddress, curvePoolAbi, waffle.provider);
    apeUSDCurveGauge = new ethers.Contract(apeUSDCurveGaugeAddress, erc20Abi, waffle.provider);
    apeUSDConvexDeposit = new ethers.Contract(apeUSDConvexDepositTokenAddress, erc20Abi, waffle.provider);
    baseRewardPool = new ethers.Contract(apeUSDConvexBaseRewardPoolAddress, baseRewardPoolAbi, waffle.provider);
    apeUSDStakedConvexWrapperFrax = new ethers.Contract(apeUSDStakedConvexWrapperForFraxAddress, erc20Abi, waffle.provider);
  });

  describe('depositAndStakeLock', async () => {
    const apeUSDBorrowAmount = toWei('10000');

    it('depositAndStakeLock', async () => {
      const [
        apeUSDBalanceInCurvePoolBefore,
        convexVoterBalanceInCurveGaugeBefore,
        userConvexDepositBalanceInBaseRewardPoolBefore
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDCurveMetapoolAddress),
        apeUSDCurveGauge.balanceOf(convexVoterProxyAddress),
        baseRewardPool.balanceOf(apeUSDStakedConvexWrapperForFraxAddress)
      ]);

      const estimatedAmount = await stabilizer.getAmountCurveLP(apeUSDBorrowAmount);
      console.log('Estimated Curve LP received amount', estimatedAmount.toString());

      await stabilizer.connect(admin).depositAndStakeLock(apeUSDBorrowAmount, 0, period);

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(apeUSDBorrowAmount);
      expect(await stabilizer.getApeUSDBorrowBalance()).to.eq(apeUSDBorrowAmount);

      // Check recevied LP balances.
      const apeUSDCurveLPBalance = await apeUSDCurveLP.balanceOf(stabilizer.address);
      expect(apeUSDCurveLPBalance).to.eq(0); // deposited to Curve Gauge through Convex voter proxy.

      const apeUSDConvexDepositBalance = await apeUSDConvexDeposit.balanceOf(stabilizer.address);
      expect(apeUSDConvexDepositBalance).to.eq(0); // staked to Convex base reward pool.

      const apeUSDStakedConvexWrapperFraxBalance = await apeUSDStakedConvexWrapperFrax.balanceOf(stabilizer.address);
      expect(apeUSDStakedConvexWrapperFraxBalance).to.eq(0); // locked to Frax staking pool.

      // Check pool balances.
      const [
        apeUSDBalanceInCurvePoolAfter,
        convexVoterBalanceInCurveGaugeAfter,
        userConvexDepositBalanceInBaseRewardPoolAfter
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDCurveMetapoolAddress),
        apeUSDCurveGauge.balanceOf(convexVoterProxyAddress),
        baseRewardPool.balanceOf(apeUSDStakedConvexWrapperForFraxAddress)
      ]);
      expect(apeUSDBalanceInCurvePoolAfter).to.eq(apeUSDBalanceInCurvePoolBefore.add(apeUSDBorrowAmount));

      // curve LP increased in guage == balance of apeUSD Staked Convex wrapper Frax increased in base reward pool
      const curveLPIncreasedInGuage = convexVoterBalanceInCurveGaugeAfter.sub(convexVoterBalanceInCurveGaugeBefore);
      expect(userConvexDepositBalanceInBaseRewardPoolAfter).to.eq(userConvexDepositBalanceInBaseRewardPoolBefore.add(curveLPIncreasedInGuage));

      // curve LP increased in guage == stabilizer locked LP
      let totalLPLocked = await stabilizer.getTotalLPLocked();
      expect(totalLPLocked).to.eq(curveLPIncreasedInGuage);

      const totalLPLockedValue = await stabilizer.getTotalLPLockedValue();
      console.log('Total Curve LP locked amount', totalLPLocked.toString());
      console.log('Total Curve LP locked value', totalLPLockedValue.toString());

      // Deposit second time.
      await stabilizer.connect(admin).depositAndStakeLock(apeUSDBorrowAmount, 0, period);

      const locks = await stabilizer.getAllLocks();
      expect(locks.length).to.eq(2);

      totalLPLocked = await stabilizer.getTotalLPLocked();
      let total = ethers.BigNumber.from(0);
      for (let i = 0; i < locks.length; i++) {
        total = total.add(locks[i].liquidity);
      }
      expect(total).to.eq(totalLPLocked);
    });

    it('depositAndIncreaseLockAmount / extendLock', async () => {
      // Deposit and lock first.
      await stabilizer.connect(admin).depositAndStakeLock(apeUSDBorrowAmount, 0, period);

      let locks = await stabilizer.getAllLocks();
      expect(locks.length).to.eq(1);

      const totalLPLockedBefore = await stabilizer.getTotalLPLocked();
      expect(totalLPLockedBefore).to.eq(locks[0].liquidity);

      // Increase the lock amount.
      const kekID = locks[0].kek_id;
      await stabilizer.connect(admin).depositAndIncreaseLockAmount(apeUSDBorrowAmount, 0, kekID);

      locks = await stabilizer.getAllLocks();
      expect(locks.length).to.eq(1);

      const totalLPLockedAfter = await stabilizer.getTotalLPLocked();
      expect(totalLPLockedAfter).to.eq(locks[0].liquidity);
      expect(totalLPLockedAfter).to.gt(totalLPLockedBefore);

      console.log('Total Curve LP locked amount before', totalLPLockedBefore.toString());
      console.log('Total Curve LP locked amount after', totalLPLockedAfter.toString());

      // Extend the lock.
      const expireTime = locks[0].ending_timestamp;
      const newExpireTime = expireTime.add(100);
      await stabilizer.connect(admin).extendLock(kekID, newExpireTime);

      locks = await stabilizer.getAllLocks();
      expect(locks.length).to.eq(1);
      expect(locks[0].ending_timestamp).to.eq(newExpireTime);
    });
  });

  describe('unstakeAndWithdraw / seize / claimRewards', async () => {
    const apeUSDBorrowAmount = toWei('10000');
    const userApeUSDBorrowAmount = toWei('10000');

    it('depositAndStakeLock, unstakeAndWithdraw, and seize', async () => {
      // Deposit and lock first.
      await stabilizer.connect(admin).depositAndStakeLock(apeUSDBorrowAmount, 0, period);

      // Increase time.
      await hre.network.provider.send("evm_increaseTime", [period]);
      await hre.network.provider.send("evm_mine");

      // Faucet some apeUSD to stablilzer.
      await apeApeUSD.connect(user).borrow(userAddress, userApeUSDBorrowAmount);
      await apeUSD.connect(user).transfer(stabilizer.address, userApeUSDBorrowAmount);

      const locks = await stabilizer.getAllLocks();
      expect(locks.length).to.eq(1);

      const lpAmount = locks[0].liquidity;
      const estimatedAmount = await stabilizer.getAmountApeUSD(lpAmount);
      console.log('Estimated apeUSD received amount', estimatedAmount.toString());

      // Unstake and withdraw.
      const kekID = locks[0].kek_id;
      await stabilizer.connect(admin).unstakeAndWithdraw(kekID, 0);

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0);

      const apeUSDBalance = await apeUSD.balanceOf(stabilizer.address);
      expect(apeUSDBalance).to.gt(0);
      console.log('Remaining apeUSD balance', apeUSDBalance.toString());

      // No borrow balance, can seize apeUSD.
      await stabilizer.connect(admin).seize(apeUSDAddress);
      expect(await apeUSD.balanceOf(adminAddress)).to.eq(apeUSDBalance);
      expect(await apeUSD.balanceOf(stabilizer.address)).to.eq(0);
    });

    it('depositAndStakeLock and claimRewards', async () => {
      // Deposit and stake.
      await stabilizer.connect(admin).depositAndStakeLock(apeUSDBorrowAmount, 0, period);

      // Increase time.
      await hre.network.provider.send("evm_increaseTime", [period]);
      await hre.network.provider.send("evm_mine");

      const [
        crvBalance1,
        cvxBalance1,
        fxsBalance1
      ] = await Promise.all([
        crv.balanceOf(stabilizer.address),
        cvx.balanceOf(stabilizer.address),
        fxs.balanceOf(stabilizer.address)
      ]);
      expect(crvBalance1).to.eq(0);
      expect(cvxBalance1).to.eq(0);
      expect(fxsBalance1).to.eq(0);

      const claimable = await stabilizer.getClaimableRewards();

      // Claim rewards
      await stabilizer.connect(admin).claimRewards();

      const [
        crvBalance2,
        cvxBalance2,
        fxsBalance2
      ] = await Promise.all([
        crv.balanceOf(stabilizer.address),
        cvx.balanceOf(stabilizer.address),
        fxs.balanceOf(stabilizer.address)
      ]);
      expect(crvBalance2).to.gt(0);
      expect(cvxBalance2).to.gt(0);
      expect(fxsBalance2).to.gt(0);

      console.log('CRV estimated', claimable[0].amount.toString());
      console.log('CRV balance  ', crvBalance2.toString());
      console.log('CVX estimated', claimable[1].amount.toString());
      console.log('CVX balance  ', cvxBalance2.toString());
      console.log('FXS estimated', claimable[2].amount.toString());
      console.log('FXS balance  ', fxsBalance2.toString());
    });
  });

  describe('negative case', async () => {
    it('fail for not admin', async () => {
      await expect(stabilizer.connect(user).depositAndStakeLock(0, 0, period)).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(stabilizer.connect(user).depositAndIncreaseLockAmount(0, 0, '0x0000000000000000000000000000000000000000000000000000000000000000')).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(stabilizer.connect(user).extendLock('0x0000000000000000000000000000000000000000000000000000000000000000', 0)).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(stabilizer.connect(user).unstakeAndWithdraw('0x0000000000000000000000000000000000000000000000000000000000000000', 0)).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(stabilizer.connect(user).seize(apeUSDAddress)).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(stabilizer.connect(user).claimRewards()).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
