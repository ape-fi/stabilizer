// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IApeToken.sol";

contract StableSwap is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public constant FRAX =
        IERC20(0x853d955aCEf822Db058eb8505911ED77F175b99e);
    IApeToken public immutable apeApeUSD;
    IERC20 public immutable apeUSD;

    event Swap(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut
    );
    event Seize(address token, uint256 amount);

    constructor(address _apeApeUSD) {
        apeApeUSD = IApeToken(_apeApeUSD);
        apeUSD = IERC20(apeApeUSD.underlying());
    }

    function swap(uint256 amount) external whenNotPaused returns (uint256) {
        require(amount > 0, "invalid amount");
        require(
            apeApeUSD.borrow(payable(address(this)), amount) == 0,
            "borrow failed"
        );
        FRAX.safeTransferFrom(msg.sender, address(this), amount);
        apeUSD.safeTransfer(msg.sender, amount);
        emit Swap(address(FRAX), amount, address(apeUSD), amount);
        return amount;
    }

    function pause() external whenNotPaused onlyOwner {
        _pause();
    }

    function unpause() external whenPaused onlyOwner {
        _unpause();
    }

    function repay() external onlyOwner {
        uint256 repayAmount = apeUSD.balanceOf(address(this));
        uint256 borrowBalance = apeApeUSD.borrowBalanceCurrent(address(this));
        if (repayAmount > borrowBalance) {
            repayAmount = borrowBalance;
        }
        apeUSD.safeIncreaseAllowance(address(apeApeUSD), repayAmount);
        require(
            apeApeUSD.repayBorrow(payable(address(this)), repayAmount) == 0,
            "repay failed"
        );
    }

    function seize(address token, uint256 amount) external onlyOwner {
        if (
            token == address(apeUSD) ||
            token == address(FRAX)
        ) {
            uint256 borrowBalance = apeApeUSD.borrowBalanceCurrent(
                address(this)
            );
            require(borrowBalance == 0, "borrow balance not zero");
        }
        IERC20(token).safeTransfer(owner(), amount);
        emit Seize(token, amount);
    }
}
