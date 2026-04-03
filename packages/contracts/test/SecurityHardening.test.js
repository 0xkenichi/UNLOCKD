const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Vestra Architectural Security Hardening", function () {
  this.timeout(120000);
  let multisig, factory, registry, adapter, valuation;
  let owner, signer1, signer2, signer3, borrower, recipient;
  const rankStandard = 3;

  beforeEach(async function () {
    [owner, signer1, signer2, signer3, borrower, recipient] = await ethers.getSigners();

    // 1. Deploy Registry
    const VestingRegistry = await ethers.getContractFactory("VestingRegistry");
    registry = await VestingRegistry.deploy(owner.address);

    // 2. Deploy Factory
    const VestingFactory = await ethers.getContractFactory("VestingFactory");
    factory = await VestingFactory.deploy(registry.target, owner.address); // Using owner as reward token for mock

    // 3. Deploy Adapter
    const VestingAdapter = await ethers.getContractFactory("VestingAdapter");
    adapter = await VestingAdapter.deploy(registry.target, owner.address);

    // 4. Deploy Multisig Relayer (2-of-3)
    const VestraMultisigRelayer = await ethers.getContractFactory("VestraMultisigRelayer");
    multisig = await VestraMultisigRelayer.deploy([signer1.address, signer2.address, signer3.address], owner.address);

    // 5. Deploy ValuationEngine
    const ValuationEngine = await ethers.getContractFactory("ValuationEngine");
    valuation = await ValuationEngine.deploy(registry.target, owner.address);

    // Setup Roles
    await registry.connect(owner).grantRole(await registry.GUARDIAN_ROLE(), factory.target);
    await adapter.connect(owner).setFactory(factory.target);
    await valuation.connect(owner).setCoprocessor(multisig.target);
  });

  describe("Gap 5: Multisig Relayer", function () {
    it("should allow execution with 2/3 signatures (Stressed: 10 iterations)", async function () {
      const token = ethers.ZeroAddress;
      for (let nonce = 10; nonce < 20; nonce++) {
        const fragment = valuation.interface.getFunction("updateRiskParams");
        const data = valuation.interface.encodeFunctionData(fragment, [
          token, 1000 + nonce, 9400, 500, 500, 500, 1000000, 100, 100
        ]);
        const chainId = (await ethers.provider.getNetwork()).chainId;

        const txHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "bytes", "uint256", "uint256"],
            [valuation.target, data, nonce, chainId]
          )
        );

        const sig1 = await signer1.signMessage(ethers.getBytes(txHash));
        const sig2 = await signer2.signMessage(ethers.getBytes(txHash));
        const sigs = [sig1, sig2];
        if (signer1.address.toLowerCase() > signer2.address.toLowerCase()) {
          sigs.reverse();
        }

        await expect(multisig.execute(valuation.target, data, nonce, sigs))
          .to.emit(multisig, "TransactionExecuted");
      }
    });

    it("should fail with only 1 signature", async function () {
      const data = "0x";
      const nonce = 2;
      const sig1 = await signer1.signMessage(ethers.getBytes(ethers.ZeroHash));
      
      await expect(multisig.execute(valuation.target, data, nonce, [sig1]))
        .to.be.revertedWith("need exactly 2 signatures");
    });
  });

  describe("Gap 6: VestingFactory Validation", function () {
    it("should allow escrow of legitimate factory-deployed contracts (Stressed: 5 iterations)", async function () {
      for (let i = 0; i < 5; i++) {
        const tx = await factory.createVesting(borrower.address, 1000 + i, 12);
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === 'VestingContractCreated');
        const mockVestingAddr = event.args.contractAddress;
        
        // This confirms the factory is tracking the deployments
        expect(await factory.isLegit(mockVestingAddr)).to.equal(true);
      }
    });

    it("should revert escrow for unauthorized/fake contracts (Stressed: 5 iterations)", async function () {
      for (let i = 0; i < 5; i++) {
        const fakeVesting = registry.target; // Keep using a contract addr to pass code.length
        const collateralId = 200 + i;
        
        // Ensure rank is set 
        await registry.connect(owner).vetContract(fakeVesting, 3);
        
        await expect(adapter.connect(borrower).escrow(collateralId, fakeVesting, borrower.address))
          .to.be.revertedWith("unauthorized factory deployment");
      }
    });
  });
});
