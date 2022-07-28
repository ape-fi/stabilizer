/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-deploy");
require("dotenv").config();

module.exports = {
  networks: {
    hardhat: {
      forking: {
        url: `https://rpc.ankr.com/eth/${process.env.ANKR_API_KEY}`,
      },
    },
    mainnet: {
      url: `https://rpc.ankr.com/eth/${process.env.ANKR_API_KEY}`,
      accounts:
        process.env.DEPLOY_PRIVATE_KEY == undefined
          ? []
          : [`0x${process.env.DEPLOY_PRIVATE_KEY}`],
    },
  },
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey:
      process.env.ETHERSCAN_API_KEY == undefined
        ? ""
        : process.env.ETHERSCAN_API_KEY,
  },
};
