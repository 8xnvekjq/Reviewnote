// Web Crypto API-based AES-GCM encryption/decryption utility for PWA API Keys

const stringToBuffer = (str: string): Uint8Array => {
  return new TextEncoder().encode(str);
};

const bufferToString = (buf: ArrayBuffer): string => {
  return new TextDecoder().decode(buf);
};

const bufferToBase64 = (buf: ArrayBuffer | ArrayBufferView): string => {
  const bytes = 'buffer' in buf 
    ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    : new Uint8Array(buf);
    
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToBuffer = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Derive a cryptographic key from a user PIN using PBKDF2
const deriveKey = async (pin: string, salt: Uint8Array): Promise<CryptoKey> => {
  const pinBuffer = stringToBuffer(pin);
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    pinBuffer.buffer as ArrayBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * Encrypts an API Key using AES-GCM and a user-provided PIN
 * Returns a serialized JSON string containing base64 encoded salt, iv, and ciphertext.
 */
export const encryptApiKey = async (apiKey: string, pin: string): Promise<string> => {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes is standard for AES-GCM
  const key = await deriveKey(pin, salt);
  
  const keyData = stringToBuffer(apiKey);
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer
    },
    key,
    keyData.buffer as ArrayBuffer
  );

  const payload = {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(encryptedBuffer)
  };

  return JSON.stringify(payload);
};

/**
 * Decrypts a serialized JSON payload containing the encrypted API Key using a user-provided PIN.
 */
export const decryptApiKey = async (encryptedJson: string, pin: string): Promise<string> => {
  try {
    const payload = JSON.parse(encryptedJson);
    if (!payload.salt || !payload.iv || !payload.ciphertext) {
      throw new Error('Invalid encrypted format');
    }

    const salt = base64ToBuffer(payload.salt);
    const iv = base64ToBuffer(payload.iv);
    const ciphertext = base64ToBuffer(payload.ciphertext);

    const key = await deriveKey(pin, salt);
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer
      },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    return bufferToString(decryptedBuffer);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('PIN 번호가 일치하지 않거나 복호화에 실패했습니다.');
  }
};
