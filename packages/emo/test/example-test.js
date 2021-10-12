const ClaimVerifier = artifacts.require("ClaimVerifier");
const ClaimFalsifier = artifacts.require("ClaimFalsifier");

contract("ClaimVerifier", async accounts => {
  it("test", async () => {
    let falsifierInstance = await ClaimFalsifier.deployed();
    let verifierAddress = await falsifierInstance.claimVerifier();
    let instance = await ClaimVerifier.at(verifierAddress);
    let client = await instance.getClient.call();

    console.log(client);
  });
});
