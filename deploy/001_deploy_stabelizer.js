module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("Stabilizer", {
    from: deployer,
    args: ["0xc7319dBc86A121313Bc48B7C54d0672756465031"],
    log: true,
  });
};

module.exports.tags = ["stabelizer"];
