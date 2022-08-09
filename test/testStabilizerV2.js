const { expect } = require('chai');
const { ethers, waffle } = require('hardhat');
const { impersonateAccount } = require('./testUtil');
const comptrollerAbi = require('../abi/comptroller');
const erc20Abi = require('../abi/erc20');
const apeTokenAbi = require('../abi/apeToken');
const baseRewardPoolAbi = require('../abi/baseRewardPool');
const curvePoolAbi = require('../abi/curvePool');

describe("StabilizerV2", () => {
  const toWei = ethers.utils.parseEther;
  const comptrollerAddress = '0xDE607fe5Cb415d83Fe4A976afD97e5DaEeaedB07';
  const apeAdminAddress = '0x02cA76E87779412a77Ee77C3600D72F68b9ea68C';
  const apeApeUSDAddress = '0xc7319dBc86A121313Bc48B7C54d0672756465031';
  const whaleAddress = '0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE';
  const crvAddress = '0xD533a949740bb3306d119CC777fa900bA034cd52';
  const apeUSDAddress = '0xfF709449528B6fB6b88f557F7d93dEce33bca78D';
  const apeUSDCurveMetapoolAddress = '0x04b727C7e246CA70d496ecF52E6b6280f3c8077D';
  const apeUSDCurveGaugeAddress = '0xD6e48Cc0597a1Ee12a8BeEB88e22bFDb81777164';
  const convexVoterProxyAddress = '0x989AEb4d175e16225E39E87d0D97A3360524AD80';
  const apeUSDConvexDepositTokenAddress = '0x5eC62baD0Fa0C6b7F87b3b86EdfE1BcD2A3139e2';
  const apeUSDConvexBaseRewardPoolAddress = '0x51e6B84968D56a1E5BC93Ee264e95b1Ea577339c';

  let accounts;
  let admin, adminAddress;
  let user, userAddress;
  let apeAdmin, whale;
  let stabilizer;
  let comptroller;
  let crv;
  let apeUSD;
  let apeApeUSD;
  let apeUSDCurveLP; // apeUSD curve metapool LP
  let apeUSDCurveGauge; // apeUSD curve gauge
  let apeUSDConvexDeposit; // apeUSD convex deposit token
  let baseRewardPool; // apeUSD convex reward pool

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    admin = accounts[0];
    adminAddress = await admin.getAddress();
    user = accounts[1];
    userAddress = await user.getAddress();

    apeAdmin = await impersonateAccount(apeAdminAddress);
    whale = await impersonateAccount(whaleAddress);

    const stabilizerFactory = await ethers.getContractFactory("StabilizerV2");

    stabilizer = await stabilizerFactory.deploy(apeApeUSDAddress);

    // Set credit limit.
    comptroller = new ethers.Contract(comptrollerAddress, comptrollerAbi, waffle.provider);
    await comptroller.connect(apeAdmin)._setCreditLimit(stabilizer.address, apeApeUSDAddress, toWei('1000000'));
    await comptroller.connect(apeAdmin)._setCreditLimit(userAddress, apeApeUSDAddress, toWei('1000000'));

    crv = new ethers.Contract(crvAddress, erc20Abi, waffle.provider);
    apeUSD = new ethers.Contract(apeUSDAddress, erc20Abi, waffle.provider);
    apeApeUSD = new ethers.Contract(apeApeUSDAddress, apeTokenAbi, waffle.provider);
    apeUSDCurveLP = new ethers.Contract(apeUSDCurveMetapoolAddress, curvePoolAbi, waffle.provider);
    apeUSDCurveGauge = new ethers.Contract(apeUSDCurveGaugeAddress, erc20Abi, waffle.provider);
    apeUSDConvexDeposit = new ethers.Contract(apeUSDConvexDepositTokenAddress, erc20Abi, waffle.provider);
    baseRewardPool = new ethers.Contract(apeUSDConvexBaseRewardPoolAddress, baseRewardPoolAbi, waffle.provider);
  });

  describe('depositAndStake', async () => {
    const apeUSDBorrowAmount = toWei('10000');

    it('depositAndStake', async () => {
      const [
        apeUSDBalanceInCurvePoolBefore,
        convexVoterBalanceInCurveGaugeBefore
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDCurveMetapoolAddress),
        apeUSDCurveGauge.balanceOf(convexVoterProxyAddress)
      ]);

      const estimatedAmount = await stabilizer.getAmountCurveLP(apeUSDBorrowAmount);
      console.log('Estimated Curve LP received amount', estimatedAmount.toString());

      await stabilizer.connect(admin).depositAndStake(apeUSDBorrowAmount, 0);

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(apeUSDBorrowAmount);

      // Check recevied LP balances.
      const apeUSDCurveLPBalance = await apeUSDCurveLP.balanceOf(stabilizer.address);
      expect(apeUSDCurveLPBalance).to.eq(0); // deposited to Curve Gauge through Convex voter proxy.

      const apeUSDConvexDepositBalance = await apeUSDConvexDeposit.balanceOf(stabilizer.address);
      expect(apeUSDConvexDepositBalance).to.eq(0); // staked to Convex base reward pool.

      const userConvexDepositBalanceInBaseRewardPool = await baseRewardPool.balanceOf(stabilizer.address);
      expect(userConvexDepositBalanceInBaseRewardPool).to.gt(0);
      console.log('Convex deposit token balance in base reward pool', userConvexDepositBalanceInBaseRewardPool.toString());

      // Check pool balances.
      const [
        apeUSDBalanceInCurvePoolAfter,
        convexVoterBalanceInCurveGaugeAfter
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDCurveMetapoolAddress),
        apeUSDCurveGauge.balanceOf(convexVoterProxyAddress)
      ]);
      expect(apeUSDBalanceInCurvePoolAfter).to.eq(apeUSDBalanceInCurvePoolBefore.add(apeUSDBorrowAmount));
      expect(convexVoterBalanceInCurveGaugeAfter).to.eq(convexVoterBalanceInCurveGaugeBefore.add(userConvexDepositBalanceInBaseRewardPool));
    });
  });

  describe('unstakeAndWithdraw / seize / claimRewards', async () => {
    const apeUSDBorrowAmount = toWei('10000');
    const userApeUSDBorrowAmount = toWei('500000');

    it('depositAndStake, unstakeAndWithdraw, and seize', async () => {
      // Deposit and stake first.
      await stabilizer.connect(admin).depositAndStake(apeUSDBorrowAmount, 0);

      // Unbalance the pool by faucet some apeUSD.
      await apeApeUSD.connect(user).borrow(userAddress, userApeUSDBorrowAmount);
      await apeUSD.connect(user).approve(apeUSDCurveLP.address, userApeUSDBorrowAmount);
      await apeUSDCurveLP.connect(user).add_liquidity([userApeUSDBorrowAmount, 0], 0, userAddress);

      const userConvexDepositBalanceInBaseRewardPool = await baseRewardPool.balanceOf(stabilizer.address);

      const estimatedAmount = await stabilizer.getAmountApeUSD(userConvexDepositBalanceInBaseRewardPool);
      console.log('Estimated apeUSD received amount', estimatedAmount.toString());

      // Unstake and withdraw.
      await stabilizer.connect(admin).unstakeAndWithdraw(userConvexDepositBalanceInBaseRewardPool, 0);

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0);

      const apeUSDBalance = await apeUSD.balanceOf(stabilizer.address);
      expect(apeUSDBalance).to.gt(0);
      console.log('Remaining apeUSD balance', apeUSDBalance.toString());

      // No borrow balance, can seize apeUSD.
      await stabilizer.connect(admin).seize(apeUSDAddress, apeUSDBalance);
      expect(await apeUSD.balanceOf(adminAddress)).to.eq(apeUSDBalance);
      expect(await apeUSD.balanceOf(stabilizer.address)).to.eq(0);
    });

    it('depositAndStake and claimRewards', async () => {
      // Deposit and stake.
      await stabilizer.connect(admin).depositAndStake(apeUSDBorrowAmount, 0);

      const crvBalance1 = await crv.balanceOf(stabilizer.address);
      expect(crvBalance1).to.eq(0);

      // Claim rewards
      await stabilizer.connect(admin).claimRewards();

      const crvBalance2 = await crv.balanceOf(stabilizer.address);
      console.log('CRV balance', crvBalance2.toString());
      expect(crvBalance2).to.gt(0);
    });
  });

  describe('negative case', async () => {
    it('fail for not admin', async () => {
      await expect(stabilizer.connect(user).depositAndStake(0, 0)).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(stabilizer.connect(user).unstakeAndWithdraw(0, 0)).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(stabilizer.connect(user).seize(apeUSDAddress, 0)).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(stabilizer.connect(user).claimRewards()).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
