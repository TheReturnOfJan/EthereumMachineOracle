const { FeeMarketEIP1559Transaction } = require('@ethereumjs/tx/'); // package comes along with web3
const { Hardfork } = require('@ethereumjs/common/');
const { config } = require('../inits');
const Common = require('@ethereumjs/common/');

const password = process.env.PASSWORD;
const cryp = require('crypto');
const utils = require('web3-utils');
const scrypt = require('scrypt-js');

const encrypted = require("../keystore/keystore.json");
const decryptedPK = decrypt(encrypted, password);

const common = new Common.default({
  chain: config.chainId,
  hardfork: Hardfork.London,
});


/*
txData:
{ data: '0x',
  gasLimit: "0x5208",
  maxPriorityFeePerGas: '0x3b9aca00',
  maxFeePerGas: '0x4e3b29200',
  nonce: "0x1a",
  to: '0x69262F3256181cf0A62c5f5E9f8cd8fcC7B8F8e7',
  value: '0x16345785d8a0000',
  type: '0x02' }
*/

function getRawTransaction(txData) {
  const tx = FeeMarketEIP1559Transaction.fromTxData(txData, { common });
  const privateKey = Buffer.from(decryptedPK.slice(2), 'hex');
  const signed = tx.sign(privateKey);
  const txHash = '0x' + signed.hash().toString('hex');
  const rawTransaction = '0x' + signed.serialize().toString('hex');
  return {
    txHash,
    rawTransaction
  }
}


function decrypt(v3Keystore, password, nonStrict) {
    /* jshint maxcomplexity: 10 */
    if (!(typeof password === 'string')) {
        throw new Error('No password given.');
    }

    var json = (!!v3Keystore && typeof v3Keystore === 'object') ? v3Keystore : JSON.parse(nonStrict ? v3Keystore.toLowerCase() : v3Keystore);

    if (json.version !== 3) {
        throw new Error('Not a valid V3 wallet');
    }

    var derivedKey;
    var kdfparams;
    if (json.crypto.kdf === 'scrypt') {
        kdfparams = json.crypto.kdfparams;

        // FIXME: support progress reporting callback
        derivedKey = scrypt.syncScrypt(Buffer.from(password), Buffer.from(kdfparams.salt, 'hex'), kdfparams.n, kdfparams.r, kdfparams.p, kdfparams.dklen);
    } else if (json.crypto.kdf === 'pbkdf2') {
        kdfparams = json.crypto.kdfparams;

        if (kdfparams.prf !== 'hmac-sha256') {
            throw new Error('Unsupported parameters to PBKDF2');
        }

        derivedKey = cryp.pbkdf2Sync(Buffer.from(password), Buffer.from(kdfparams.salt, 'hex'), kdfparams.c, kdfparams.dklen, 'sha256');
    } else {
        throw new Error('Unsupported key derivation scheme');
    }

    var ciphertext = Buffer.from(json.crypto.ciphertext, 'hex');

    var mac = utils.sha3(Buffer.from([...derivedKey.slice(16, 32), ...ciphertext])).replace('0x', '');
    if (mac !== json.crypto.mac) {
        throw new Error('Key derivation failed - possibly wrong password');
    }

    var decipher = cryp.createDecipheriv(json.crypto.cipher, derivedKey.slice(0, 16), Buffer.from(json.crypto.cipherparams.iv, 'hex'));
    var seed = '0x' + Buffer.from([...decipher.update(ciphertext), ...decipher.final()]).toString('hex');

    return seed;
};

module.exports = getRawTransaction;
