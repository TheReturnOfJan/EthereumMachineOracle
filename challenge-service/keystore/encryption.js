// Before use challenger or run this script or paste keystore.json in this folder
//0xece09645f4022a31c3153844fec70b1c544cbf744eadd4102336a5c26fb94040
/*
Usage:
PRIV_KEY=0x86bd05de62f4d29a96db6ed004de2ebd0e39940dc0f2f99fdfe38271b915290e PASSWORD='big shutdown' node encryption.js

*/
const fs = require("fs");
const Web3 = require("web3");

const web3 = new Web3();
const privateKey = process.env.PRIV_KEY;
const password = process.env.PASSWORD;

if (privateKey === undefined) {
  console.log("Cannot encrypt undefined private key");
} else if (password === undefined) {
  console.log("Cannot encrypt without password");
} else {
  const encrypted = web3.eth.accounts.encrypt(privateKey, password);
  const file = JSON.stringify(encrypted);
  fs.writeFileSync("./keystore.json", file);
}
