module.exports = [
  'function balanceOf(address account) external view returns (uint)',
  'function transfer(address to, uint amount) external returns (bool)',
  'function add_liquidity(uint256[2] memory _amounts, uint256 _min_mint_amount, address _receiver) external returns (uint256)',
  'function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256)',
];
