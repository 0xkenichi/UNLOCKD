// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

contract MockSwapRouter is ISwapRouter {
    function uniswapV3SwapCallback(
        int256,
        int256,
        bytes calldata
    ) external pure {
        revert("unsupported");
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable override returns (uint256 amountOut) {
        if (params.tokenIn == params.tokenOut) {
            require(
                IERC20(params.tokenIn).transferFrom(
                    msg.sender,
                    params.recipient,
                    params.amountIn
                ),
                "transfer failed"
            );
            return params.amountIn;
        }

        require(
            IERC20(params.tokenIn).transferFrom(
                msg.sender,
                address(this),
                params.amountIn
            ),
            "transfer failed"
        );
        require(
            IERC20(params.tokenOut).transfer(params.recipient, params.amountIn),
            "transfer failed"
        );
        return params.amountIn;
    }

    function exactInput(
        ExactInputParams calldata
    ) external payable override returns (uint256) {
        revert("not implemented");
    }

    function exactOutputSingle(
        ExactOutputSingleParams calldata
    ) external payable override returns (uint256) {
        revert("not implemented");
    }

    function exactOutput(
        ExactOutputParams calldata
    ) external payable override returns (uint256) {
        revert("not implemented");
    }
}
