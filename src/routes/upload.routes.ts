import { Hono } from "hono";
import { verifyPrivyJWT } from "../lib/auth";
import { quotaMiddleware } from "../middleware/quota";
import { rateLimitMemorySaves } from "../middleware/rateLimit";

export const uploadRoutes = new Hono();

async function pinataUpload(name: string, content: Buffer | string, mimeType: string) {
  const formData = new FormData();
  const blob = new Blob([content], { type: mimeType });
  formData.append("file", blob, name);

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PINATA_JWT || ""}`,
    },
    body: formData,
  });

  if (!response.ok) return null;
  return response.json();
}

uploadRoutes.post("/ipfs", verifyPrivyJWT, quotaMiddleware, rateLimitMemorySaves, async (c) => {
  const body = await c.req.json();
  const blobBase64 = body.blob as string;

  if (!blobBase64) {
    return c.json({ success: false, error: "blob is required" }, 400);
  }

  const result = await pinataUpload("memory.bin", Buffer.from(blobBase64, "base64"), "application/octet-stream");
  if (!result?.IpfsHash) {
    return c.json({ success: false, error: "pinata upload failed" }, 500);
  }

  return c.json({ cid: result.IpfsHash });
});

uploadRoutes.post("/manifest", verifyPrivyJWT, async (c) => {
  const body = await c.req.json();
  const result = await pinataUpload("manifest.json", JSON.stringify(body), "application/json");

  if (!result?.IpfsHash) {
    return c.json({ success: false, error: "manifest upload failed" }, 500);
  }

  return c.json({ cid: result.IpfsHash });
});
