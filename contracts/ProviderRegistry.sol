// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @custom:security-contact security@agentrail.dev
 */
contract ProviderRegistry is Ownable {
    struct Provider {
        address wallet;
        address deviceSigner;
        uint32 serviceMask;
        bool active;
        string name;
        string metadataURI;
        uint64 updatedAt;
    }

    mapping(bytes32 => Provider) private providers;

    error InvalidAddress();
    error InvalidProviderId();
    error ProviderNotFound();

    event ProviderUpserted(
        bytes32 indexed providerId,
        address indexed wallet,
        address indexed deviceSigner,
        uint32 serviceMask,
        bool active,
        string name,
        string metadataURI
    );

    event ProviderRemoved(bytes32 indexed providerId);

    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
    }

    function upsertProvider(
        bytes32 providerId,
        address wallet,
        address deviceSigner,
        uint32 serviceMask,
        bool active,
        string calldata name,
        string calldata metadataURI
    ) external onlyOwner {
        if (providerId == bytes32(0)) revert InvalidProviderId();
        if (wallet == address(0)) revert InvalidAddress();
        if (deviceSigner == address(0)) revert InvalidAddress();

        providers[providerId] = Provider({
            wallet: wallet,
            deviceSigner: deviceSigner,
            serviceMask: serviceMask,
            active: active,
            name: name,
            metadataURI: metadataURI,
            updatedAt: uint64(block.timestamp)
        });

        emit ProviderUpserted(providerId, wallet, deviceSigner, serviceMask, active, name, metadataURI);
    }

    function removeProvider(bytes32 providerId) external onlyOwner {
        Provider memory provider = providers[providerId];
        if (provider.wallet == address(0)) revert ProviderNotFound();

        delete providers[providerId];
        emit ProviderRemoved(providerId);
    }

    function getProvider(bytes32 providerId) external view returns (Provider memory provider) {
        provider = providers[providerId];
        if (provider.wallet == address(0)) revert ProviderNotFound();
    }

    function isProviderActive(bytes32 providerId) external view returns (bool) {
        Provider memory provider = providers[providerId];
        return provider.wallet != address(0) && provider.active;
    }
}
