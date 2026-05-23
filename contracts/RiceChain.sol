// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract RiceChain {
    struct Participant {
        string name;
        string role;
        string contact;
        string organization;
        uint256 registeredAt;
        uint256 updatedAt;
        bool exists;
    }

    struct Product {
        uint256 id;
        string productName;
        string batchCode;
        string origin;
        string metadata;
        address farmer;
        address currentOwner;
        address assignedTransporter;
        address assignedVendor;
        string currentStatus;
        string currentLocation;
        uint256 registeredAt;
        uint256 statusUpdatedAt;
        bool delivered;
        bool exists;
    }

    struct TraceEntry {
        string action;
        address actor;
        address from;
        address to;
        string status;
        string location;
        uint256 timestamp;
    }

    uint256 public productCount;

    mapping(address => Participant) private participants;
    mapping(uint256 => Product) private products;
    mapping(uint256 => TraceEntry[]) private productHistory;

    event ParticipantRegistered(
        address indexed wallet,
        string name,
        string role,
        string organization
    );
    event ParticipantUpdated(
        address indexed wallet,
        string name,
        string role,
        string organization
    );
    event ProductRegistered(
        uint256 indexed productId,
        address indexed farmer,
        string productName,
        string batchCode
    );
    event OwnershipTransferred(
        uint256 indexed productId,
        address indexed from,
        address indexed to
    );
    event ShipmentUpdated(
        uint256 indexed productId,
        address indexed actor,
        string status,
        string location
    );
    event ShipmentAssigned(
        uint256 indexed productId,
        address indexed trader,
        address indexed transporter,
        address vendor
    );
    event DeliveryConfirmed(uint256 indexed productId, address indexed actor);
    event TraceEventRecorded(
        uint256 indexed productId,
        string action,
        address indexed actor,
        address from,
        address to,
        string status,
        string location,
        uint256 timestamp
    );

    modifier productExists(uint256 productId) {
        require(products[productId].exists, "Product does not exist");
        _;
    }

    modifier onlyCurrentOwner(uint256 productId) {
        require(products[productId].currentOwner == msg.sender, "Only current owner");
        _;
    }

    function registerOrUpdateParticipant(
        string calldata name,
        string calldata role,
        string calldata contact,
        string calldata organization
    ) external {
        require(bytes(name).length > 0, "Participant name required");
        require(_isValidRole(role), "Invalid participant role");

        Participant storage participant = participants[msg.sender];
        bool alreadyExists = participant.exists;
        uint256 timestamp = block.timestamp;

        if (!alreadyExists) {
            participant.registeredAt = timestamp;
            participant.exists = true;
        }

        participant.name = name;
        participant.role = role;
        participant.contact = contact;
        participant.organization = organization;
        participant.updatedAt = timestamp;

        if (alreadyExists) {
            emit ParticipantUpdated(msg.sender, name, role, organization);
        } else {
            emit ParticipantRegistered(msg.sender, name, role, organization);
        }
    }

    function registerProduct(
        string calldata productName,
        string calldata batchCode,
        string calldata origin,
        string calldata metadata
    ) external returns (uint256 productId) {
        _requireRole(msg.sender, "Farmer");
        require(bytes(productName).length > 0, "Product name required");
        require(bytes(batchCode).length > 0, "Batch code required");

        productId = ++productCount;
        products[productId] = Product({
            id: productId,
            productName: productName,
            batchCode: batchCode,
            origin: origin,
            metadata: metadata,
            farmer: msg.sender,
            currentOwner: msg.sender,
            assignedTransporter: address(0),
            assignedVendor: address(0),
            currentStatus: "Registered",
            currentLocation: origin,
            registeredAt: block.timestamp,
            statusUpdatedAt: block.timestamp,
            delivered: false,
            exists: true
        });

        _recordTrace(
            productId,
            "Product registered",
            msg.sender,
            address(0),
            msg.sender,
            "Registered",
            origin
        );

        emit ProductRegistered(productId, msg.sender, productName, batchCode);
    }

    function transferOwnership(
        uint256 productId,
        address receiverAddress
    ) external productExists(productId) onlyCurrentOwner(productId) {
        _requireRole(msg.sender, "Farmer");
        require(receiverAddress != address(0), "Receiver required");
        require(receiverAddress != msg.sender, "Receiver must differ");
        require(!products[productId].delivered, "Product already delivered");
        _requireRole(receiverAddress, "Trader");

        Product storage product = products[productId];
        address previousOwner = product.currentOwner;
        product.currentOwner = receiverAddress;
        product.currentStatus = "Transferred";
        product.currentLocation = "";
        product.statusUpdatedAt = block.timestamp;

        _recordTrace(
            productId,
            "Ownership transferred",
            msg.sender,
            previousOwner,
            receiverAddress,
            "Transferred",
            ""
        );

        emit OwnershipTransferred(productId, previousOwner, receiverAddress);
    }

    function assignShipment(
        uint256 productId,
        address transporterAddress,
        address vendorAddress
    ) external productExists(productId) onlyCurrentOwner(productId) {
        _requireRole(msg.sender, "Trader");
        require(transporterAddress != address(0), "Transporter required");
        require(vendorAddress != address(0), "Vendor required");
        _requireRole(transporterAddress, "Transporter");
        _requireRole(vendorAddress, "Vendor");
        require(!products[productId].delivered, "Product already delivered");

        Product storage product = products[productId];
        product.assignedTransporter = transporterAddress;
        product.assignedVendor = vendorAddress;
        product.currentStatus = "Assigned";
        product.currentLocation = "";
        product.statusUpdatedAt = block.timestamp;

        _recordTrace(
            productId,
            "Shipment assigned",
            msg.sender,
            transporterAddress,
            vendorAddress,
            "Assigned",
            ""
        );

        emit ShipmentAssigned(productId, msg.sender, transporterAddress, vendorAddress);
    }

    function updateShipment(
        uint256 productId,
        string calldata status,
        string calldata location
    ) external productExists(productId) {
        _requireRole(msg.sender, "Transporter");
        require(products[productId].assignedTransporter == msg.sender, "Only assigned transporter");
        require(bytes(status).length > 0, "Shipment status required");
        require(!products[productId].delivered, "Product already delivered");

        Product storage product = products[productId];
        product.currentStatus = status;
        product.currentLocation = location;
        product.statusUpdatedAt = block.timestamp;

        _recordTrace(
            productId,
            "Shipment updated",
            msg.sender,
            address(0),
            product.assignedVendor,
            status,
            location
        );

        emit ShipmentUpdated(productId, msg.sender, status, location);
    }

    function confirmDelivery(
        uint256 productId
    ) external productExists(productId) {
        _requireRole(msg.sender, "Vendor");
        require(products[productId].assignedVendor == msg.sender, "Only assigned vendor");
        require(!products[productId].delivered, "Product already delivered");
        require(_roleEquals(products[productId].currentStatus, "Ready for vendor confirmation"), "Shipment not ready");

        Product storage product = products[productId];
        address previousOwner = product.currentOwner;
        product.currentOwner = msg.sender;
        product.currentStatus = "Delivered";
        product.statusUpdatedAt = block.timestamp;
        product.delivered = true;

        _recordTrace(
            productId,
            "Delivery confirmed",
            msg.sender,
            previousOwner,
            msg.sender,
            "Delivered",
            product.currentLocation
        );

        emit DeliveryConfirmed(productId, msg.sender);
    }

    function getProduct(
        uint256 productId
    ) external view productExists(productId) returns (Product memory) {
        return products[productId];
    }

    function getHistory(
        uint256 productId
    ) external view productExists(productId) returns (TraceEntry[] memory) {
        return productHistory[productId];
    }

    function getParticipant(
        address wallet
    ) external view returns (Participant memory) {
        return participants[wallet];
    }

    function _recordTrace(
        uint256 productId,
        string memory action,
        address actor,
        address from,
        address to,
        string memory status,
        string memory location
    ) private {
        uint256 timestamp = block.timestamp;

        productHistory[productId].push(
            TraceEntry({
                action: action,
                actor: actor,
                from: from,
                to: to,
                status: status,
                location: location,
                timestamp: timestamp
            })
        );

        emit TraceEventRecorded(
            productId,
            action,
            actor,
            from,
            to,
            status,
            location,
            timestamp
        );
    }

    function _requireRole(address wallet, string memory role) private view {
        require(participants[wallet].exists, "Participant not registered");
        require(_roleEquals(participants[wallet].role, role), "Invalid participant role for action");
    }

    function _isValidRole(string memory role) private pure returns (bool) {
        return
            _roleEquals(role, "Farmer") ||
            _roleEquals(role, "Trader") ||
            _roleEquals(role, "Transporter") ||
            _roleEquals(role, "Vendor");
    }

    function _roleEquals(
        string memory left,
        string memory right
    ) private pure returns (bool) {
        return keccak256(bytes(left)) == keccak256(bytes(right));
    }
}
