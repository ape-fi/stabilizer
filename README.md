# apeUSD Stabilizer

## Installation
    npm install

## Methodology

Stabilizer is used when apeUSD is depegged in Curve pool. The first version of stabilizer only has two admin functions to rebalance the pool.

- swapApeUSDForStable: Borrow apeUSD through credit limit and swap apeUSD for stable coin (FRAX or USDC) when the price of apeUSD is greater than $1.
- swapStableForApeUSD: Swap stable coin (FRAX or USDC) for apeUSD and repay the debts when the price of apeUSD is smaller than $1.
