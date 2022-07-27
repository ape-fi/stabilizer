/**
 * @type import('hardhat/config').HardhatUserConfig
 */
 require("@nomiclabs/hardhat-waffle");
 require('dotenv').config();

 module.exports = {
   networks: {
     hardhat: {
       forking: {
         url: `https://rpc.ankr.com/eth/${process.env.ANKR_API_KEY}`
       },
     },
   },
   solidity: {
     version: "0.8.9" ,
     settings: {
       optimizer: {
         enabled: true,
         runs: 200
       }
     }
   },
 };

