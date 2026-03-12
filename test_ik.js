import dns from "node:dns";
dns.setDefaultResultOrder('ipv4first');

import ImageKit from "imagekit";
import { config } from "dotenv";

config({ path: '.env' });

const ik = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: "invalid_key",
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

console.log("Testing ImageKit upload with DNS fix...");

// Create a small buffer
const buffer = Buffer.from("test content " + Date.now());

ik.upload({
    file: buffer,
    fileName: `test-${Date.now()}.txt`,
    folder: "test"
}, function(error, result) {
    if (error) {
        console.error("--- UPLOAD FAILED ---");
        console.error("RAW ERROR:", error);
        console.error("TYPE:", typeof error);
        console.error("KEYS:", Object.keys(error));
        console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    } else {
        console.log("Upload success:", result.url);
    }
});
