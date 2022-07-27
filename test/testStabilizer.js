const { expect } = require('chai');
const { ethers, waffle } = require('hardhat');
const { impersonateAccount } = require('./testUtil');
const comptrollerAbi = require('../abi/comptroller');
const erc20Abi = require('../abi/erc20');
const apeTokenAbi = require('../abi/apeToken');

describe("Stabilizer", () => {
  const toWei = ethers.utils.parseEther;
  const comptrollerAddress = '0xDE607fe5Cb415d83Fe4A976afD97e5DaEeaedB07';
  const apeAdminAddress = '0x02cA76E87779412a77Ee77C3600D72F68b9ea68C';
  const apeApeUSDAddress = '0xc7319dBc86A121313Bc48B7C54d0672756465031';
  const whaleAddress = '0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE';
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const fraxAddress = '0x853d955aCEf822Db058eb8505911ED77F175b99e';
  const apeUSDAddress = '0xfF709449528B6fB6b88f557F7d93dEce33bca78D';
  const apeUSDMetapoolAddress = '0x04b727C7e246CA70d496ecF52E6b6280f3c8077D';
  const fraxUsdcPoolAddress = '0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2';

  let accounts;
  let admin, adminAddress;
  let user, userAddress;
  let apeAdmin, whale;
  let stabilizer;
  let comptroller;
  let usdc, frax, apeUSD;
  let apeApeUSD;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    admin = accounts[0];
    adminAddress = await admin.getAddress();
    user = accounts[1];
    userAddress = await user.getAddress();

    apeAdmin = await impersonateAccount(apeAdminAddress);
    whale = await impersonateAccount(whaleAddress);

    const stabilizerFactory = await ethers.getContractFactory("Stabilizer");

    stabilizer = await stabilizerFactory.deploy(apeApeUSDAddress);

    // Set credit limit.
    comptroller = new ethers.Contract(comptrollerAddress, comptrollerAbi, waffle.provider);
    await comptroller.connect(apeAdmin)._setCreditLimit(stabilizer.address, apeApeUSDAddress, toWei('1000000'));
    await comptroller.connect(apeAdmin)._setCreditLimit(userAddress, apeApeUSDAddress, toWei('1000000'));

    usdc = new ethers.Contract(usdcAddress, erc20Abi, waffle.provider);
    frax = new ethers.Contract(fraxAddress, erc20Abi, waffle.provider);
    apeUSD = new ethers.Contract(apeUSDAddress, erc20Abi, waffle.provider);

    apeApeUSD = new ethers.Contract(apeApeUSDAddress, apeTokenAbi, waffle.provider);
  });

  describe('swapApeUSDForStable', async () => {
    const amount = toWei('10000');
    let amountAfterFee;

    beforeEach(async () => {
      const borrowFee = await apeApeUSD.borrowFee();
      amountAfterFee = amount.mul(toWei('1').sub(borrowFee)).div(toWei('1'));
    });

    it('swap for FRAX', async () => {
      const [
        apeUSDBalanceBefore,
        fraxBalanceBefore,
        usdcBalanceBefore
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDMetapoolAddress),
        frax.balanceOf(fraxUsdcPoolAddress),
        usdc.balanceOf(fraxUsdcPoolAddress)
      ]);

      await stabilizer.connect(admin).swapApeUSDForStable(amount, 1, 0); // 1: FRAX

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(amount);

      // Check recevied balances.
      const fraxBalance = await frax.balanceOf(stabilizer.address);
      expect(fraxBalance).to.gt(0);
      console.log('FRAX balance', fraxBalance.toString());

      const usdcBalance = await usdc.balanceOf(stabilizer.address);
      expect(usdcBalance).to.eq(0);
      console.log('USDC balance', usdcBalance.toString());

      // Check pool balances.
      const [
        apeUSDBalanceAfter,
        fraxBalanceAfter,
        usdcBalanceAfter
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDMetapoolAddress),
        frax.balanceOf(fraxUsdcPoolAddress),
        usdc.balanceOf(fraxUsdcPoolAddress)
      ]);
      expect(apeUSDBalanceAfter).to.eq(apeUSDBalanceBefore.add(amountAfterFee));
      expect(fraxBalanceAfter).to.eq(fraxBalanceBefore.sub(fraxBalance));
      expect(usdcBalanceAfter).to.eq(usdcBalanceBefore.sub(usdcBalance));
    });

    it('swap for FRAX without borrow', async () => {
      const [
        apeUSDBalanceBefore,
        fraxBalanceBefore,
        usdcBalanceBefore
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDMetapoolAddress),
        frax.balanceOf(fraxUsdcPoolAddress),
        usdc.balanceOf(fraxUsdcPoolAddress)
      ]);

      // Faucet some apeUSD.
      await apeApeUSD.connect(user).borrow(userAddress, amount);
      const bal = await apeUSD.balanceOf(userAddress);
      await apeUSD.connect(user).transfer(stabilizer.address, bal);

      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0); // no borrow balance

      await stabilizer.connect(admin).swapApeUSDForStable(0, 1, 0); // 1: FRAX

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0);

      // Check recevied balances.
      const fraxBalance = await frax.balanceOf(stabilizer.address);
      expect(fraxBalance).to.gt(0);
      console.log('FRAX balance', fraxBalance.toString());

      const usdcBalance = await usdc.balanceOf(stabilizer.address);
      expect(usdcBalance).to.eq(0);
      console.log('USDC balance', usdcBalance.toString());

      // Check pool balances.
      const [
        apeUSDBalanceAfter,
        fraxBalanceAfter,
        usdcBalanceAfter
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDMetapoolAddress),
        frax.balanceOf(fraxUsdcPoolAddress),
        usdc.balanceOf(fraxUsdcPoolAddress)
      ]);
      expect(apeUSDBalanceAfter).to.eq(apeUSDBalanceBefore.add(amountAfterFee));
      expect(fraxBalanceAfter).to.eq(fraxBalanceBefore.sub(fraxBalance));
      expect(usdcBalanceAfter).to.eq(usdcBalanceBefore.sub(usdcBalance));
    });

    it('swap for USDC', async () => {
      const [
        apeUSDBalanceBefore,
        fraxBalanceBefore,
        usdcBalanceBefore
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDMetapoolAddress),
        frax.balanceOf(fraxUsdcPoolAddress),
        usdc.balanceOf(fraxUsdcPoolAddress)
      ]);

      await stabilizer.connect(admin).swapApeUSDForStable(amount, 2, 0); // 2: USDC

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(amount);

      // Check recevied balances.
      const fraxBalance = await frax.balanceOf(stabilizer.address);
      expect(fraxBalance).to.eq(0);
      console.log('FRAX balance', fraxBalance.toString());

      const usdcBalance = await usdc.balanceOf(stabilizer.address);
      expect(usdcBalance).to.gt(0);
      console.log('USDC balance', usdcBalance.toString());

      // Check pool balances.
      const [
        apeUSDBalanceAfter,
        fraxBalanceAfter,
        usdcBalanceAfter
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDMetapoolAddress),
        frax.balanceOf(fraxUsdcPoolAddress),
        usdc.balanceOf(fraxUsdcPoolAddress)
      ]);
      expect(apeUSDBalanceAfter).to.eq(apeUSDBalanceBefore.add(amountAfterFee));
      expect(fraxBalanceAfter).to.eq(fraxBalanceBefore.sub(fraxBalance));
      expect(usdcBalanceAfter).to.eq(usdcBalanceBefore.sub(usdcBalance));
    });

    it('swap for USDC without borrow', async () => {
      const [
        apeUSDBalanceBefore,
        fraxBalanceBefore,
        usdcBalanceBefore
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDMetapoolAddress),
        frax.balanceOf(fraxUsdcPoolAddress),
        usdc.balanceOf(fraxUsdcPoolAddress)
      ]);

      // Faucet some apeUSD.
      await apeApeUSD.connect(user).borrow(userAddress, amount);
      const bal = await apeUSD.balanceOf(userAddress);
      await apeUSD.connect(user).transfer(stabilizer.address, bal);

      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0); // no borrow balance

      await stabilizer.connect(admin).swapApeUSDForStable(0, 2, 0); // 2: USDC

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0);

      // Check recevied balances.
      const fraxBalance = await frax.balanceOf(stabilizer.address);
      expect(fraxBalance).to.eq(0);
      console.log('FRAX balance', fraxBalance.toString());

      const usdcBalance = await usdc.balanceOf(stabilizer.address);
      expect(usdcBalance).to.gt(0);
      console.log('USDC balance', usdcBalance.toString());

      // Check pool balances.
      const [
        apeUSDBalanceAfter,
        fraxBalanceAfter,
        usdcBalanceAfter
      ] = await Promise.all([
        apeUSD.balanceOf(apeUSDMetapoolAddress),
        frax.balanceOf(fraxUsdcPoolAddress),
        usdc.balanceOf(fraxUsdcPoolAddress)
      ]);
      expect(apeUSDBalanceAfter).to.eq(apeUSDBalanceBefore.add(amountAfterFee));
      expect(fraxBalanceAfter).to.eq(fraxBalanceBefore.sub(fraxBalance));
      expect(usdcBalanceAfter).to.eq(usdcBalanceBefore.sub(usdcBalance));
    });

    it('fail for unsupported coin', async () => {
      await expect(stabilizer.connect(admin).swapApeUSDForStable(amount, 3, 0)).to.be.revertedWith('unsupported coin');
    });

    it('fail for not admin', async () => {
      await expect(stabilizer.connect(user).swapApeUSDForStable(amount, 2, 0)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('swapStableForApeUSD', async () => {
    const amount = toWei('1'); // borrow apeUSD with small amount
    const amountFRAX = toWei('10000');
    const amountUSDC = 10000 * 1e6;

    it('swap and repay with FRAX', async () => {
      // Create borrow balance.
      await stabilizer.connect(admin).swapApeUSDForStable(amount, 1, 0); // 1: FRAX

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(amount);

      // Faucet some FRAX.
      await frax.connect(whale).transfer(stabilizer.address, amountFRAX);

      await stabilizer.connect(admin).swapStableForApeUSD(amountFRAX, 1, 0); // 1: FRAX

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0);

      // Check recevied balances.
      const apeUSDBalance = await apeUSD.balanceOf(stabilizer.address);
      expect(apeUSDBalance).to.gt(0);
      console.log('apeUSD balance', apeUSDBalance.toString());
    });

    it('reapy without swap FRAX', async () => {
      const amountApeUSD = toWei('100');

      // Create borrow balance.
      await stabilizer.connect(admin).swapApeUSDForStable(amount, 1, 0); // 1: FRAX

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(amount);

      // Faucet some FRAX and apeUSD.
      await frax.connect(whale).transfer(stabilizer.address, amountFRAX);
      await apeApeUSD.connect(user).borrow(userAddress, amountApeUSD);
      const bal = await apeUSD.balanceOf(userAddress);
      await apeUSD.connect(user).transfer(stabilizer.address, bal);

      const fraxBalanceBefore = await frax.balanceOf(stabilizer.address);

      await stabilizer.connect(admin).swapStableForApeUSD(0, 1, 0); // 1: FRAX

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0);

      // Check FRAX balances.
      const fraxBalanceAfter = await frax.balanceOf(stabilizer.address);
      expect(fraxBalanceBefore).to.eq(fraxBalanceAfter);
    });

    it('swap and repay with USDC', async () => {
      // Create borrow balance.
      await stabilizer.connect(admin).swapApeUSDForStable(amount, 2, 0); // 2: USDC

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(amount);

      // Faucet some USDC.
      await usdc.connect(whale).transfer(stabilizer.address, amountUSDC);

      await stabilizer.connect(admin).swapStableForApeUSD(amountUSDC, 2, 0); // 2: USDC

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0);

      // Check recevied balances.
      const apeUSDBalance = await apeUSD.balanceOf(stabilizer.address);
      expect(apeUSDBalance).to.gt(0);
      console.log('apeUSD balance', apeUSDBalance.toString());
    });

    it('reapy without swap USDC', async () => {
      const amountApeUSD = toWei('100');

      // Create borrow balance.
      await stabilizer.connect(admin).swapApeUSDForStable(amount, 2, 0); // 2: USDC

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(amount);

      // Faucet some USDC and apeUSD.
      await usdc.connect(whale).transfer(stabilizer.address, amountUSDC);
      await apeApeUSD.connect(user).borrow(userAddress, amountApeUSD);
      const bal = await apeUSD.balanceOf(userAddress);
      await apeUSD.connect(user).transfer(stabilizer.address, bal);

      const usdcBalanceBefore = await usdc.balanceOf(stabilizer.address);

      await stabilizer.connect(admin).swapStableForApeUSD(0, 2, 0); // 2: USDC

      // Check borrow balance.
      expect(await apeApeUSD.borrowBalanceStored(stabilizer.address)).to.eq(0);

      // Check USDC balances.
      const usdcBalanceAfter = await usdc.balanceOf(stabilizer.address);
      expect(usdcBalanceBefore).to.eq(usdcBalanceAfter);
    });

    it('fail for unsupported coin', async () => {
      await expect(stabilizer.connect(admin).swapStableForApeUSD(0, 3, 0)).to.be.revertedWith('unsupported coin');
    });

    it('fail for not admin', async () => {
      await expect(stabilizer.connect(user).swapStableForApeUSD(0, 2, 0)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('seize', async () => {
    const amountFRAX = toWei('10000');
    const amountUSDC = 10000 * 1e6;
    const amountApeUSD = toWei('100');

    it('seize successfully', async () => {
      // Faucet some FRAX, USDC and apeUSD.
      await frax.connect(whale).transfer(stabilizer.address, amountFRAX);
      await usdc.connect(whale).transfer(stabilizer.address, amountUSDC);
      await apeApeUSD.connect(user).borrow(userAddress, amountApeUSD);
      const apeUSDBal = await apeUSD.balanceOf(userAddress);
      await apeUSD.connect(user).transfer(stabilizer.address, apeUSDBal);

      await Promise.all([
        stabilizer.connect(admin).seize(frax.address, amountFRAX),
        stabilizer.connect(admin).seize(usdc.address, amountUSDC),
        stabilizer.connect(admin).seize(apeUSD.address, apeUSDBal)
      ]);

      expect(await frax.balanceOf(adminAddress)).to.eq(amountFRAX);
      expect(await usdc.balanceOf(adminAddress)).to.eq(amountUSDC);
      expect(await apeUSD.balanceOf(adminAddress)).to.eq(apeUSDBal);
    });

    it('fail to seize for non-zero borrow balance', async () => {
      await stabilizer.connect(admin).swapApeUSDForStable(amountApeUSD, 1, 0); // 1: FRAX

      await expect(stabilizer.connect(admin).seize(frax.address, 0)).to.be.revertedWith('borrow balance not zero');
      await expect(stabilizer.connect(admin).seize(usdc.address, 0)).to.be.revertedWith('borrow balance not zero');
      await expect(stabilizer.connect(admin).seize(apeUSD.address, 0)).to.be.revertedWith('borrow balance not zero');
    });

    it('fail to seize for not admin', async () => {
      await expect(stabilizer.connect(user).seize(frax.address, 0)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
