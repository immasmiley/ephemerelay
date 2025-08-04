// Test nsec key conversion
const testNsec = "nsec1rugv94sqvdye9ks4q4cawyfav33csuumnza8t4xjxsj7uj5g3ytsgq6cvx";

function isValidNsecKey(key) {
  return /^nsec1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/.test(key);
}

async function nsecToHex(nsec) {
  try {
    if (!isValidNsecKey(nsec)) throw new Error('Invalid nsec format');
    const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    const dataPart = nsec.slice(5);
    const values = [];
    for (let ch of dataPart) {
      const idx = charset.indexOf(ch);
      if (idx === -1) throw new Error('Invalid bech32 character');
      values.push(idx);
    }
    const dataWords = values.slice(0, -6);
    let bits = 0;
    let buffer = 0;
    const bytes = [];
    for (const word of dataWords) {
      buffer = (buffer << 5) | word;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    const privBytes = bytes.slice(0, 32);
    if (privBytes.length !== 32) throw new Error('Invalid decoded length');
    return Array.from(privBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.error('Error converting nsec to hex:', error);
    throw error;
  }
}

console.log('Testing nsec key:', testNsec);
console.log('Valid format:', isValidNsecKey(testNsec));

nsecToHex(testNsec)
  .then(hex => {
    console.log('Converted to hex:', hex);
    console.log('Hex length:', hex.length);
    console.log('Valid hex format:', /^[0-9a-fA-F]{64}$/.test(hex));
  })
  .catch(error => {
    console.error('Conversion failed:', error);
  }); 